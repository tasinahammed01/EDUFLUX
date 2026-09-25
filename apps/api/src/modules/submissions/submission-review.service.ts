import { AssignmentModel } from "../assignments/assignment.model.js";
import { RubricRevisionModel } from "../assignments/rubric-revision.model.js";
import { UserModel } from "../users/user.model.js";
import { ApiError } from "../../utils/api-error.js";
import { env } from "../../config/env.js";
import { getObjectStorage } from "../../storage/object-storage.js";
import { scheduleBackgroundTask } from "../../infrastructure/background-scheduler.js";
import { SubmissionModel } from "./submission.model.js";
import { SubmissionAttemptModel } from "./submission-attempt.model.js";
import { SubmissionFileModel } from "./submission-file.model.js";
import { SubmissionEvaluationModel } from "./submission-evaluation.model.js";
import { getOcrProvider, OcrProviderError } from "./ocr.service.js";
import type { OcrResult } from "./ocr.service.js";
import { OcrPageModel } from "./ocr-page.model.js";
import {
  mapIssuesToOcrWords,
  suppressLowConfidenceMechanics,
} from "./ocr-issue-mapping.js";
import { getEvaluationProvider } from "./evaluation.service.js";
import { AIProviderError } from "../ai/ai-provider.service.js";
import pino from "pino";
import type { SubmissionReviewStatusDto } from "@eduflux/shared-types";
import type { SubmissionEvaluationRecord } from "./submission-evaluation.model.js";

const evaluationLogger = pino({ level: env.LOG_LEVEL });

function safeFailure(error: unknown) {
  if (error instanceof OcrProviderError && error.code === "OCR_EMPTY_RESULT")
    return "We couldn't read enough text from this file to evaluate it.";
  if (error instanceof Error && /not configured/i.test(error.message))
    return "Automated review is not configured yet.";
  return "We could not complete the automated review. Your submission is still safely stored.";
}

type FailureStage = "OCR" | "AI_EVALUATION" | "VALIDATION" | "PERSISTENCE";
function classifyFailure(error: unknown, stage: FailureStage) {
  if (error instanceof OcrProviderError)
    return {
      stage: "OCR" as const,
      code: error.code,
      httpStatus: error.httpStatus,
    };
  if (error instanceof AIProviderError)
    return {
      stage: "AI_EVALUATION" as const,
      code: error.code,
      httpStatus: error.httpStatus,
      providerCode: error.providerCode,
      evaluationPass: error.evaluationPass,
      finishReason: error.finishReason,
      repairAttempted: error.repairAttempted,
      timeout: error.timeout,
    };
  return {
    stage,
    code:
      stage === "OCR"
        ? "OCR_PROVIDER_REQUEST_FAILED"
        : stage === "PERSISTENCE"
          ? "PERSISTENCE_FAILED"
          : "AI_PROVIDER_REQUEST_FAILED",
  };
}

export async function ensureEvaluation(attemptId: string) {
  const attempt = await SubmissionAttemptModel.findById(attemptId)
    .lean()
    .exec();
  if (!attempt)
    throw new ApiError(
      404,
      "ATTEMPT_NOT_FOUND",
      "Submission attempt not found.",
    );
  return SubmissionEvaluationModel.findOneAndUpdate(
    { attemptId: attempt._id },
    {
      $setOnInsert: {
        submissionId: attempt.submissionId,
        assignmentId: attempt.assignmentId,
        classId: attempt.classId,
        studentUserId: attempt.studentUserId,
        rubricRevisionId: attempt.rubricRevisionId,
        sourceFileIds: attempt.fileIds,
        status: "PENDING",
        processingStage: "PENDING",
        transcribedText: "",
        effectiveText: "",
        issues: [],
        correctionStats: {},
        legendSummary: [],
        strengths: [],
        feedbackSections: [],
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).exec();
}

export function queueEvaluation(attemptId: string) {
  evaluationLogger.info({ attemptId }, "[evaluation] queued");
  scheduleBackgroundTask(
    processEvaluation(attemptId).catch((error: unknown) => {
      evaluationLogger.error(
        {
          attemptId,
          stage: "evaluation-boundary",
          code: "EVALUATION_RUNNER_FAILED",
          errorType: error instanceof Error ? error.name : "UnknownError",
        },
        "[evaluation] runner failed safely",
      );
    }),
  );
}

function queueAiRetry(attemptId: string, evaluationId: string) {
  evaluationLogger.info({ attemptId, evaluationId }, "[evaluation] AI retry queued");
  scheduleBackgroundTask(
    processEvaluation(attemptId, {
      reusePersistedOcr: true,
      claimedEvaluationId: evaluationId,
    }).catch((error: unknown) => {
      evaluationLogger.error(
        {
          attemptId,
          evaluationId,
          stage: "evaluation-retry-boundary",
          code: "EVALUATION_RETRY_RUNNER_FAILED",
          errorType: error instanceof Error ? error.name : "UnknownError",
        },
        "[evaluation] AI retry runner failed safely",
      );
    }),
  );
}

export async function processEvaluation(
  attemptId: string,
  options: { reusePersistedOcr?: boolean; claimedEvaluationId?: string } = {},
) {
  const evaluation = options.claimedEvaluationId
    ? await SubmissionEvaluationModel.findById(options.claimedEvaluationId).exec()
    : await ensureEvaluation(attemptId);
  if (!evaluation || evaluation.status === "COMPLETED") return evaluation;
  if (!options.claimedEvaluationId && evaluation.status === "PROCESSING")
    return evaluation;
  const claimed = options.claimedEvaluationId
    ? evaluation
    : await SubmissionEvaluationModel.findOneAndUpdate(
        { _id: evaluation._id, status: { $in: ["PENDING", "FAILED"] } },
        {
          $set: { status: "PROCESSING", processingStage: "OCR" },
          $unset: { statusMessage: 1, failureStage: 1, failureCode: 1 },
        },
        { returnDocument: "after" },
      ).exec();
  if (!claimed) return evaluation;
  evaluationLogger.info({ attemptId }, "[evaluation] processing");
  let stage: FailureStage = "PERSISTENCE";
  try {
    const [attempt, assignment] = await Promise.all([
      SubmissionAttemptModel.findById(attemptId).lean().exec(),
      AssignmentModel.findById(claimed.assignmentId).lean().exec(),
    ]);
    if (!attempt || !assignment)
      throw new Error("Submission source is unavailable");
    let ocr: OcrResult;
    let effectiveText: string;
    if (options.reusePersistedOcr) {
      const persistedPages = await OcrPageModel.find({ evaluationId: claimed._id })
        .lean()
        .exec();
      const fileOrder = new Map(
        attempt.fileIds.map((id, index) => [id.toString(), index]),
      );
      const pages = persistedPages
        .sort(
          (left, right) =>
            (fileOrder.get(left.sourceFileId.toString()) ?? Number.MAX_SAFE_INTEGER) -
              (fileOrder.get(right.sourceFileId.toString()) ?? Number.MAX_SAFE_INTEGER) ||
            left.pageNumber - right.pageNumber,
        )
        .map((page) => ({
          sourceFileId: page.sourceFileId.toString(),
          pageNumber: page.pageNumber,
          width: page.width,
          height: page.height,
          startOffset: page.startOffset,
          endOffset: page.endOffset,
          text: page.text,
          words: page.words,
        }));
      ocr = {
        text: claimed.transcribedText,
        provider: claimed.ocrMetadata?.provider ?? "persisted",
        model: claimed.ocrMetadata?.model ?? "persisted",
        processedFiles: claimed.ocrMetadata?.processedFiles ?? attempt.fileIds.length,
        pages,
        completedAt: claimed.ocrMetadata?.completedAt ?? claimed.updatedAt,
      };
      effectiveText = claimed.effectiveText;
      if (!effectiveText.trim() || (!ocr.text.trim() && pages.length === 0))
        throw new Error("Persisted OCR is unavailable for retry");
    } else {
      const foundFiles = await SubmissionFileModel.find({
        _id: { $in: attempt.fileIds },
        status: "READY",
      })
        .select("+objectKey")
        .lean()
        .exec();
      const fileById = new Map(
        foundFiles.map((file) => [file._id.toString(), file]),
      );
      const files = attempt.fileIds.flatMap((id) => {
        const file = fileById.get(id.toString());
        return file ? [file] : [];
      });
      stage = "OCR";
      if (files.length) {
        claimed.processingStage = "OCR";
        claimed.statusMessage = "Reading your uploaded work...";
        await claimed.save();
      }
      ocr = files.length
        ? await getOcrProvider().extract(files)
        : {
            text: "",
            provider: "none",
            model: "none",
            processedFiles: 0,
            pages: [],
            completedAt: new Date(),
          };
      effectiveText = [attempt.typedText.trim(), ocr.text.trim()]
        .filter(Boolean)
        .join("\n\n");
    }
    if (!effectiveText)
      throw new Error("Submission contained no readable text");
    if (!options.reusePersistedOcr) {
      await OcrPageModel.deleteMany({ evaluationId: claimed._id }).exec();
      if (ocr.pages.length)
        await OcrPageModel.insertMany(
          ocr.pages.map((page) => ({
            evaluationId: claimed._id,
            attemptId: attempt._id,
            sourceFileId: page.sourceFileId,
            pageNumber: page.pageNumber,
            width: page.width,
            height: page.height,
            startOffset: page.startOffset,
            endOffset: page.endOffset,
            text: page.text,
            words: page.words,
          })),
        );
    }
    claimed.set({
      transcribedText: ocr.text,
      effectiveText,
      ocrMetadata: {
        provider: ocr.provider,
        model: ocr.model,
        processedFiles: ocr.processedFiles,
        completedAt: ocr.completedAt,
      },
    });
    await claimed.save();
    const rubric = attempt.rubricRevisionId
      ? await RubricRevisionModel.findOne({
          _id: attempt.rubricRevisionId,
          assignmentId: attempt.assignmentId,
        })
          .lean()
          .exec()
      : null;
    if (!rubric) throw new Error("Bound rubric revision is unavailable");
    stage = "AI_EVALUATION";
    claimed.processingStage = "AI_EVALUATION";
    claimed.statusMessage = "Analyzing your writing...";
    await claimed.save();
    const generated = await getEvaluationProvider().evaluate({
      text: effectiveText,
      assignmentTitle: assignment.title,
      assignmentPrompt: [assignment.description, assignment.instructions]
        .filter(Boolean)
        .join("\n\n"),
      rubric: rubric.rubric,
      maxScore: rubric.maxScore,
    });
    stage = "PERSISTENCE";
    claimed.processingStage = "FINALIZING";
    claimed.statusMessage = "Preparing your feedback...";
    await claimed.save();
    const mappedIssues = suppressLowConfidenceMechanics(
      mapIssuesToOcrWords(
        generated.result.issues,
        ocr.pages,
        ocr.text,
        Math.max(0, effectiveText.indexOf(ocr.text)),
      ),
      ocr.pages,
    );
    const correctionStats: Record<string, number> = {
      content: 0,
      organization: 0,
      grammar: 0,
      vocabulary: 0,
      mechanics: 0,
    };
    const legendCounts = new Map<string, { label: string; count: number }>();
    for (const issue of mappedIssues) {
      correctionStats[issue.category] =
        (correctionStats[issue.category] ?? 0) + 1;
      const current = legendCounts.get(issue.code);
      legendCounts.set(issue.code, {
        label: issue.label,
        count: (current?.count ?? 0) + 1,
      });
    }
    const legendSummary = [...legendCounts].map(([code, value]) => ({
      code,
      ...value,
    }));
    claimed.set({
      status: "COMPLETED",
      processingStage: "COMPLETED",
      transcribedText: ocr.text,
      effectiveText,
      ocrMetadata: {
        provider: ocr.provider,
        model: ocr.model,
        processedFiles: ocr.processedFiles,
        completedAt: ocr.completedAt,
      },
      ...generated.result,
      issues: mappedIssues,
      correctionStats,
      legendSummary,
      evaluationMetadata: {
        provider: generated.provider,
        model: generated.model,
        tokensUsed: generated.tokensUsed,
      },
      completedAt: new Date(),
    });
    claimed.set("statusMessage", undefined);
    await claimed.save();
    evaluationLogger.info({ attemptId }, "[evaluation] completed");
    return claimed;
  } catch (error) {
    const failure = classifyFailure(error, stage);
    claimed.status = "FAILED";
    claimed.statusMessage = safeFailure(error);
    claimed.failureStage = failure.stage;
    claimed.failureCode = failure.code;
    try {
      await claimed.save();
    } catch {
      failure.stage = "PERSISTENCE";
      failure.code = "PERSISTENCE_FAILED";
    }
    evaluationLogger.error(
      {
        attemptId,
        stage: failure.stage,
        provider: failure.stage === "OCR" ? env.OCR_PROVIDER : env.AI_PROVIDER,
        model:
          failure.stage === "OCR" ? env.OCR_MODEL : env.AI_EVALUATION_MODEL,
        code: failure.code,
        ...(failure.httpStatus ? { httpStatus: failure.httpStatus } : {}),
        ...(failure.providerCode ? { providerCode: failure.providerCode } : {}),
        ...(failure.evaluationPass
          ? { evaluationPass: failure.evaluationPass }
          : {}),
        ...(failure.finishReason ? { finishReason: failure.finishReason } : {}),
        ...(failure.repairAttempted ? { repairAttempted: true } : {}),
        ...(failure.timeout ? { timeout: true } : {}),
      },
      "[evaluation] failed",
    );
    return claimed;
  }
}

export async function retryStudentAttemptReview(
  submissionId: string,
  attemptId: string,
  assignmentId: string,
  classId: string,
  userId: string,
) {
  const current = await SubmissionEvaluationModel.findOne({
    attemptId,
    submissionId,
    assignmentId,
    classId,
    studentUserId: userId,
  }).exec();
  if (!current)
    throw new ApiError(404, "EVALUATION_NOT_FOUND", "The review record is unavailable.");
  if (current.status === "PENDING" || current.status === "PROCESSING")
    return mapReviewStatus(current);
  if (current.status !== "FAILED" || current.failureStage !== "AI_EVALUATION")
    throw new ApiError(409, "REVIEW_RETRY_NOT_ALLOWED", "This review cannot be retried.");
  if (
    !current.effectiveText.trim() ||
    (!current.transcribedText.trim() && !current.ocrMetadata?.processedFiles)
  )
    throw new ApiError(
      409,
      "REVIEW_RETRY_OCR_REQUIRED",
      "The stored transcription is unavailable.",
    );
  const retryBefore = new Date(Date.now() - 30_000);
  const claimed = await SubmissionEvaluationModel.findOneAndUpdate(
    {
      _id: current._id,
      status: "FAILED",
      failureStage: "AI_EVALUATION",
      $and: [
        {
          $or: [
            { aiRetryCount: { $lt: 3 } },
            { aiRetryCount: { $exists: false } },
          ],
        },
        {
          $or: [
            { aiRetryRequestedAt: { $lte: retryBefore } },
            { aiRetryRequestedAt: { $exists: false } },
          ],
        },
      ],
    },
    {
      $set: {
        status: "PROCESSING",
        processingStage: "AI_EVALUATION",
        statusMessage: "Retrying automated review...",
        aiRetryRequestedAt: new Date(),
      },
      $inc: { aiRetryCount: 1 },
      $unset: { failureStage: 1, failureCode: 1 },
    },
    { returnDocument: "after" },
  ).exec();
  if (!claimed) {
    const latest = await SubmissionEvaluationModel.findById(current._id).exec();
    if (latest?.status === "PENDING" || latest?.status === "PROCESSING")
      return mapReviewStatus(latest);
    throw new ApiError(
      429,
      "REVIEW_RETRY_LIMITED",
      "Please wait before retrying this review again.",
    );
  }
  queueAiRetry(attemptId, claimed._id.toString());
  return mapReviewStatus(claimed);
}

async function mapReview(
  evaluation: NonNullable<Awaited<ReturnType<typeof ensureEvaluation>>>,
) {
  const [attempt, student, foundFiles, foundOcrPages] = await Promise.all([
    SubmissionAttemptModel.findById(evaluation.attemptId).lean().exec(),
    UserModel.findById(evaluation.studentUserId).lean().exec(),
    SubmissionFileModel.find({
      _id: { $in: evaluation.sourceFileIds },
      status: "READY",
    })
      .select("+objectKey")
      .lean()
      .exec(),
    OcrPageModel.find({ evaluationId: evaluation._id }).lean().exec(),
  ]);
  if (!attempt || !student)
    throw new ApiError(404, "SUBMISSION_NOT_FOUND", "Submission not found.");
  const fileById = new Map(
    foundFiles.map((file) => [file._id.toString(), file]),
  );
  const files = attempt.fileIds.flatMap((id) => {
    const file = fileById.get(id.toString());
    return file ? [file] : [];
  });
  const fileOrder = new Map(
    attempt.fileIds.map((id, index) => [id.toString(), index]),
  );
  const ocrPages = [...foundOcrPages].sort(
    (left, right) =>
      (fileOrder.get(left.sourceFileId.toString()) ?? Number.MAX_SAFE_INTEGER) -
        (fileOrder.get(right.sourceFileId.toString()) ??
          Number.MAX_SAFE_INTEGER) || left.pageNumber - right.pageNumber,
  );
  const storage = files.length ? await getObjectStorage() : undefined;
  return {
    id: evaluation._id.toString(),
    submissionId: evaluation.submissionId.toString(),
    attemptId: evaluation.attemptId.toString(),
    assignmentId: evaluation.assignmentId.toString(),
    classId: evaluation.classId.toString(),
    student: {
      id: student._id.toString(),
      displayName: student.displayName,
      email: student.email,
      ...(student.photoURL ? { photoURL: student.photoURL } : {}),
    },
    attemptNumber: attempt.attemptNumber,
    submittedAt: attempt.submittedAt.toISOString(),
    status: evaluation.status,
    ...(evaluation.processingStage
      ? { processingStage: evaluation.processingStage }
      : {}),
    ...(evaluation.statusMessage
      ? { statusMessage: evaluation.statusMessage }
      : {}),
    ...(evaluation.failureStage
      ? { failureStage: evaluation.failureStage }
      : {}),
    ...(evaluation.failureCode ? { failureCode: evaluation.failureCode } : {}),
    typedText: attempt.typedText,
    transcribedText: evaluation.transcribedText,
    effectiveText: evaluation.effectiveText,
    files: await Promise.all(
      files.map(async (file) => ({
        id: file._id.toString(),
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        status: "READY" as const,
        createdAt: file.createdAt.toISOString(),
        contentUrl: await storage!.createDownloadUrl({
          key: file.objectKey,
          filename: file.originalName,
          contentType: file.mimeType,
          disposition: "inline",
          expiresIn: env.R2_PRESIGN_TTL_SECONDS,
        }),
      })),
    ),
    ocrPages: ocrPages.map((page) => {
      const startOffset = page.startOffset ?? page.words[0]?.startOffset ?? 0;
      const endOffset =
        page.endOffset ?? page.words.at(-1)?.endOffset ?? startOffset;
      return {
        sourceFileId: page.sourceFileId.toString(),
        pageNumber: page.pageNumber,
        width: page.width,
        height: page.height,
        startOffset,
        endOffset,
        text:
          page.text ?? evaluation.transcribedText.slice(startOffset, endOffset),
        words: page.words.map((word) => ({
          id: word.id,
          text: word.text,
          startOffset: word.startOffset,
          endOffset: word.endOffset,
          ...(word.confidence !== undefined
            ? { confidence: word.confidence }
            : {}),
          boundingBox: {
            x: word.boundingBox.x,
            y: word.boundingBox.y,
            width: word.boundingBox.width,
            height: word.boundingBox.height,
          },
        })),
      };
    }),
    ...(attempt.rubricRevisionId
      ? { rubricRevisionId: attempt.rubricRevisionId.toString() }
      : {}),
    ...(attempt.rubricRevisionNumber
      ? { rubricRevisionNumber: attempt.rubricRevisionNumber }
      : {}),
    issues: evaluation.issues,
    ...(evaluation.overallScore !== undefined
      ? { overallScore: evaluation.overallScore }
      : {}),
    ...(evaluation.maxScore !== undefined
      ? { maxScore: evaluation.maxScore }
      : {}),
    correctionStats:
      evaluation.correctionStats instanceof Map
        ? Object.fromEntries(evaluation.correctionStats)
        : evaluation.correctionStats,
    legendSummary: evaluation.legendSummary,
    strengths: evaluation.strengths,
    feedbackSections: evaluation.feedbackSections,
    ...(evaluation.teacherComment
      ? { teacherComment: evaluation.teacherComment }
      : {}),
    ...(evaluation.completedAt
      ? { completedAt: evaluation.completedAt.toISOString() }
      : {}),
    updatedAt: evaluation.updatedAt.toISOString(),
  };
}

function mapReviewStatus(evaluation: {
  status: SubmissionEvaluationRecord["status"];
  processingStage?: SubmissionEvaluationRecord["processingStage"];
  statusMessage?: string;
  failureStage?: SubmissionEvaluationRecord["failureStage"];
  failureCode?: string;
  updatedAt: Date;
}): SubmissionReviewStatusDto {
  return {
    status: evaluation.status,
    ...(evaluation.processingStage
      ? { processingStage: evaluation.processingStage }
      : {}),
    ...(evaluation.statusMessage
      ? { statusMessage: evaluation.statusMessage }
      : {}),
    ...(evaluation.failureStage
      ? { failureStage: evaluation.failureStage }
      : {}),
    ...(evaluation.failureCode ? { failureCode: evaluation.failureCode } : {}),
    updatedAt: evaluation.updatedAt.toISOString(),
  };
}

export async function teacherReview(
  submissionId: string,
  assignmentId: string,
  classId: string,
) {
  const submission = await SubmissionModel.findOne({
    _id: submissionId,
    assignmentId,
    classId,
  })
    .lean()
    .exec();
  if (!submission)
    throw new ApiError(404, "SUBMISSION_NOT_FOUND", "Submission not found.");
  const attempt = await SubmissionAttemptModel.findOne({
    submissionId,
    assignmentId,
    classId,
  })
    .sort({ attemptNumber: -1 })
    .lean()
    .exec();
  if (!attempt)
    throw new ApiError(
      404,
      "ATTEMPT_NOT_FOUND",
      "No submitted attempt was found.",
    );
  const evaluation = await ensureEvaluation(attempt._id.toString());
  return mapReview(evaluation!);
}

export async function studentReview(
  assignmentId: string,
  classId: string,
  userId: string,
) {
  const attempt = await SubmissionAttemptModel.findOne({
    assignmentId,
    classId,
    studentUserId: userId,
  })
    .sort({ attemptNumber: -1 })
    .lean()
    .exec();
  if (!attempt)
    throw new ApiError(
      404,
      "ATTEMPT_NOT_FOUND",
      "No submitted attempt was found.",
    );
  const evaluation = await ensureEvaluation(attempt._id.toString());
  return mapReview(evaluation!);
}

export async function studentAttemptReview(
  submissionId: string,
  attemptId: string,
  assignmentId: string,
  classId: string,
  userId: string,
) {
  const attempt = await SubmissionAttemptModel.findOne({
    _id: attemptId,
    submissionId,
    assignmentId,
    classId,
    studentUserId: userId,
  })
    .lean()
    .exec();
  if (!attempt)
    throw new ApiError(
      404,
      "ATTEMPT_NOT_FOUND",
      "Submission attempt not found.",
    );
  const evaluation = await SubmissionEvaluationModel.findOne({
    attemptId: attempt._id,
    submissionId,
    assignmentId,
    classId,
    studentUserId: userId,
  }).exec();
  if (!evaluation)
    throw new ApiError(
      409,
      "EVALUATION_NOT_FOUND",
      "The review record is unavailable.",
    );
  return mapReview(evaluation);
}

export async function studentAttemptReviewStatus(
  submissionId: string,
  attemptId: string,
  assignmentId: string,
  classId: string,
  userId: string,
) {
  const evaluation = await SubmissionEvaluationModel.findOne({
    attemptId,
    submissionId,
    assignmentId,
    classId,
    studentUserId: userId,
  })
    .select(
      "status processingStage statusMessage failureStage failureCode updatedAt",
    )
    .lean()
    .exec();
  if (!evaluation)
    throw new ApiError(
      404,
      "EVALUATION_NOT_FOUND",
      "The review record is unavailable.",
    );
  return mapReviewStatus(evaluation);
}

export async function teacherReviewStatus(
  submissionId: string,
  assignmentId: string,
  classId: string,
) {
  const evaluation = await SubmissionEvaluationModel.findOne({
    submissionId,
    assignmentId,
    classId,
  })
    .sort({ createdAt: -1 })
    .select(
      "status processingStage statusMessage failureStage failureCode updatedAt",
    )
    .lean()
    .exec();
  if (!evaluation)
    throw new ApiError(
      404,
      "EVALUATION_NOT_FOUND",
      "The review record is unavailable.",
    );
  return mapReviewStatus(evaluation);
}

export async function teacherAttemptReview(
  submissionId: string,
  attemptId: string,
  assignmentId: string,
  classId: string,
) {
  const attempt = await SubmissionAttemptModel.findOne({
    _id: attemptId,
    submissionId,
    assignmentId,
    classId,
  })
    .lean()
    .exec();
  if (!attempt)
    throw new ApiError(
      404,
      "ATTEMPT_NOT_FOUND",
      "Submission attempt not found.",
    );
  const evaluation = await SubmissionEvaluationModel.findOne({
    attemptId: attempt._id,
    submissionId,
    assignmentId,
    classId,
  }).exec();
  if (!evaluation)
    throw new ApiError(
      409,
      "EVALUATION_NOT_FOUND",
      "The review record is unavailable.",
    );
  return mapReview(evaluation);
}

export async function saveTeacherComment(
  submissionId: string,
  assignmentId: string,
  classId: string,
  comment: string,
) {
  const review = await teacherReview(submissionId, assignmentId, classId);
  const updated = await SubmissionEvaluationModel.findByIdAndUpdate(
    review.id,
    { $set: { teacherComment: comment } },
    { returnDocument: "after", runValidators: true },
  ).exec();
  return mapReview(updated!);
}
