import { randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import type {
  SubmissionDto,
  SubmissionFileDto,
  TeacherSubmissionRow,
  UploadIntentDto,
} from "@eduflux/shared-types";
import type {
  SubmissionDraftInput,
  SubmissionFileOrderInput,
  UploadIntentInput,
} from "@eduflux/validation";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/api-error.js";
import { getObjectStorage } from "../../storage/object-storage.js";
import {
  AssignmentModel,
  type AssignmentRecord,
} from "../assignments/assignment.model.js";
import { RubricRevisionModel } from "../assignments/rubric-revision.model.js";
import { ClassMembershipModel } from "../classes/class-membership.model.js";
import { UserModel } from "../users/user.model.js";
import { SubmissionModel, type SubmissionRecord } from "./submission.model.js";
import {
  SubmissionAttemptModel,
  type SubmissionAttemptRecord,
} from "./submission-attempt.model.js";
import {
  SubmissionFileModel,
  type SubmissionFileRecord,
} from "./submission-file.model.js";
import { queueEvaluation } from "./submission-review.service.js";
import { SubmissionEvaluationModel } from "./submission-evaluation.model.js";
const allowed = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
function cleanName(value: string) {
  return value
    .replace(/[\x00-\x1f\x7f/\\]/g, "_")
    .replace(/\.\.+/g, ".")
    .slice(0, 200);
}
function fileDto(file: SubmissionFileRecord): SubmissionFileDto {
  return {
    id: file._id.toString(),
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    status: file.status === "PENDING" ? "PENDING" : "READY",
    createdAt: file.createdAt.toISOString(),
  };
}
async function policy(assignmentId: string, classId: string, session?: ClientSession) {
  const query = AssignmentModel.findOne({ _id: assignmentId, classId }).lean();
  if (session) query.session(session);
  const item = await query.exec();
  if (!item || item.status !== "PUBLISHED")
    throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
  const now = new Date();
  if (item.availableFrom && item.availableFrom > now)
    throw new ApiError(
      409,
      "ASSIGNMENT_NOT_AVAILABLE",
      "This assignment is not available yet.",
    );
  return item;
}
async function aggregate(
  assignment: AssignmentRecord,
  userId: string,
  classId: string,
) {
  return SubmissionModel.findOneAndUpdate(
    { assignmentId: assignment._id, studentUserId: userId },
    {
      $setOnInsert: {
        classId,
        status: "DRAFT",
        draftText: "",
        draftFileIds: [],
        draftRevision: 0,
        latestAttemptNumber: 0,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).exec();
}
async function details(
  submission: SubmissionRecord,
  assignment: AssignmentRecord,
): Promise<SubmissionDto> {
  const attempts = await SubmissionAttemptModel.find({
    submissionId: submission._id,
  })
    .sort({ attemptNumber: -1 })
    .lean()
    .exec();
  const ids = [
    ...submission.draftFileIds,
    ...attempts.flatMap((a) => a.fileIds),
  ];
  const files = await SubmissionFileModel.find({
    _id: { $in: ids },
    status: "READY",
  })
    .lean()
    .exec();
  const map = new Map(files.map((f) => [f._id.toString(), fileDto(f)]));
  const now = new Date(),
    isLate = Boolean(assignment.dueAt && now > assignment.dueAt);
  const max = assignment.allowResubmission
    ? (assignment.maxAttempts ?? Number.MAX_SAFE_INTEGER)
    : 1;
  let reason: string | undefined;
  if (assignment.dueAt && isLate && !assignment.allowLateSubmission)
    reason = "Submissions closed.";
  else if (submission.latestAttemptNumber >= max)
    reason = "Maximum attempts reached.";
  return {
    id: submission._id.toString(),
    assignmentId: submission.assignmentId.toString(),
    classId: submission.classId.toString(),
    status: submission.status,
    draftText: submission.draftText,
    draftFiles: submission.draftFileIds.flatMap((id) => {
      const f = map.get(id.toString());
      return f ? [f] : [];
    }),
    draftRevision: submission.draftRevision,
    latestAttemptNumber: submission.latestAttemptNumber,
    ...(submission.latestSubmittedAt
      ? { latestSubmittedAt: submission.latestSubmittedAt.toISOString() }
      : {}),
    attempts: attempts.map((a) => ({
      id: a._id.toString(),
      attemptNumber: a.attemptNumber,
      typedText: a.typedText,
      files: a.fileIds.flatMap((id) => {
        const f = map.get(id.toString());
        return f ? [f] : [];
      }),
      submittedAt: a.submittedAt.toISOString(),
      isLate: a.isLate,
      ...(a.rubricVersion ? { rubricVersion: a.rubricVersion } : {}),
      ...(a.rubricRevisionId ? { rubricRevisionId: a.rubricRevisionId.toString() } : {}),
      ...(a.rubricRevisionNumber ? { rubricRevisionNumber: a.rubricRevisionNumber } : {}),
      ...(a.rubricHash ? { rubricHash: a.rubricHash } : {}),
    })),
    canSubmit: !reason,
    canResubmit:
      submission.latestAttemptNumber > 0 &&
      submission.latestAttemptNumber < max &&
      !reason,
    ...(reason ? { unavailableReason: reason } : {}),
    isLate,
    limits: {
      maxFiles: env.SUBMISSION_MAX_FILES,
      maxFileBytes: env.SUBMISSION_MAX_FILE_BYTES,
      maxTotalBytes: env.SUBMISSION_MAX_TOTAL_BYTES,
      allowedMimeTypes: [...allowed],
    },
  };
}
export async function getStudentSubmission(
  assignmentId: string,
  classId: string,
  userId: string,
) {
  const assignment = await policy(assignmentId, classId);
  const submission = await SubmissionModel.findOne({ assignmentId, studentUserId: userId }).exec();
  if (submission) return details(submission, assignment);
  const now = new Date(), isLate = Boolean(assignment.dueAt && now > assignment.dueAt);
  const unavailableReason = assignment.dueAt && isLate && !assignment.allowLateSubmission ? "Submissions closed." : undefined;
  return { id: "", assignmentId, classId, status: "DRAFT" as const, draftText: "", draftFiles: [], draftRevision: 0, latestAttemptNumber: 0, attempts: [], canSubmit: !unavailableReason, canResubmit: false, ...(unavailableReason ? { unavailableReason } : {}), isLate, limits: { maxFiles: env.SUBMISSION_MAX_FILES, maxFileBytes: env.SUBMISSION_MAX_FILE_BYTES, maxTotalBytes: env.SUBMISSION_MAX_TOTAL_BYTES, allowedMimeTypes: [...allowed] } };
}
async function validateFiles(
  submissionId: string,
  userId: string,
  assignmentId: string,
  fileIds: string[],
  session?: ClientSession,
) {
  const query = SubmissionFileModel.find({
    _id: { $in: fileIds },
    submissionId,
    ownerUserId: userId,
    assignmentId,
    status: "READY",
  }).lean();
  if (session) query.session(session);
  const files = await query.exec();
  if (files.length !== new Set(fileIds).size)
    throw new ApiError(
      400,
      "INVALID_SUBMISSION_FILE",
      "One or more files are unavailable.",
    );
  if (
    files.reduce((n, f) => n + f.sizeBytes, 0) > env.SUBMISSION_MAX_TOTAL_BYTES
  )
    throw new ApiError(
      413,
      "FILES_TOO_LARGE",
      "Combined attachments exceed the allowed size.",
    );
  return files;
}
export async function saveDraft(
  assignmentId: string,
  classId: string,
  userId: string,
  input: SubmissionDraftInput,
) {
  const assignment = await policy(assignmentId, classId);
  const submission = await aggregate(assignment, userId, classId);
  await validateFiles(
    submission!._id.toString(),
    userId,
    assignmentId,
    input.fileIds,
  );
  const filter: Record<string, unknown> = { _id: submission!._id };
  if (input.draftRevision !== undefined)
    filter.draftRevision = input.draftRevision;
  const updated = await SubmissionModel.findOneAndUpdate(
    filter,
    {
      $set: { draftText: input.typedText, draftFileIds: input.fileIds },
      $inc: { draftRevision: 1 },
    },
    { returnDocument: "after", runValidators: true },
  ).exec();
  if (!updated)
    throw new ApiError(
      409,
      "DRAFT_CONFLICT",
      "Your draft changed elsewhere. Refresh before saving again.",
    );
  return details(updated, assignment);
}
export async function reorderDraftFiles(
  assignmentId: string,
  classId: string,
  userId: string,
  input: SubmissionFileOrderInput,
) {
  const assignment = await policy(assignmentId, classId);
  const submission = await SubmissionModel.findOne({
    assignmentId,
    classId,
    studentUserId: userId,
  }).exec();
  if (!submission)
    throw new ApiError(404, "SUBMISSION_NOT_FOUND", "Submission not found.");
  const currentIds = submission.draftFileIds.map(String);
  if (
    input.fileIds.length !== currentIds.length ||
    new Set(input.fileIds).size !== input.fileIds.length ||
    input.fileIds.some((id) => !currentIds.includes(id))
  )
    throw new ApiError(
      400,
      "INVALID_FILE_ORDER",
      "File order must contain every current draft file exactly once.",
    );
  const updated = await SubmissionModel.findOneAndUpdate(
    {
      _id: submission._id,
      draftRevision: input.draftRevision,
      draftFileIds: { $all: input.fileIds, $size: input.fileIds.length },
    },
    {
      $set: { draftFileIds: input.fileIds },
      $inc: { draftRevision: 1 },
    },
    { returnDocument: "after", runValidators: true },
  ).exec();
  if (!updated)
    throw new ApiError(
      409,
      "DRAFT_CONFLICT",
      "Your draft changed elsewhere. Refresh before reordering again.",
    );
  return details(updated, assignment);
}
export async function submitWork(
  assignmentId: string,
  classId: string,
  userId: string,
) {
  let assignment: AssignmentRecord | undefined;
  const result = await mongoose.connection.transaction(async (session) => {
    assignment = await policy(assignmentId, classId, session);
    const submission = await SubmissionModel.findOne({
      assignmentId,
      studentUserId: userId,
    }).session(session);
    if (!submission)
      throw new ApiError(
        409,
        "DRAFT_REQUIRED",
        "Save a draft before submitting.",
      );
    if (submission.draftFileIds.length === 0)
      throw new ApiError(400, "SUBMISSION_FILE_REQUIRED", "Upload at least one image or PDF before submitting.");
    await validateFiles(
      submission._id.toString(),
      userId,
      assignmentId,
      submission.draftFileIds.map(String),
      session,
    );
    const now = new Date(),
      isLate = Boolean(assignment.dueAt && now > assignment.dueAt);
    if (isLate && !assignment.allowLateSubmission)
      throw new ApiError(
        409,
        "LATE_SUBMISSION_CLOSED",
        "Late submissions are not allowed.",
      );
    const max = assignment.allowResubmission
      ? (assignment.maxAttempts ?? Number.MAX_SAFE_INTEGER)
      : 1;
    if (submission.latestAttemptNumber >= max)
      throw new ApiError(
        409,
        "MAX_ATTEMPTS_REACHED",
        "Maximum attempts reached.",
      );
    const rubricRevision = assignment.currentRubricRevisionId
      ? await RubricRevisionModel.findOne({
          _id: assignment.currentRubricRevisionId,
          assignmentId,
        })
          .session(session)
          .lean()
          .exec()
      : null;
    if (assignment.currentRubricRevisionId && !rubricRevision)
      throw new ApiError(
        409,
        "RUBRIC_REVISION_UNAVAILABLE",
        "The current rubric revision is unavailable. Try again.",
      );
    const next = submission.latestAttemptNumber + 1;
    const claimed = await SubmissionModel.findOneAndUpdate(
      {
        _id: submission._id,
        latestAttemptNumber: submission.latestAttemptNumber,
      },
      {
        $set: {
          status: "SUBMITTED",
          latestSubmittedAt: now,
          draftText: "",
          draftFileIds: [],
        },
        $inc: { latestAttemptNumber: 1, draftRevision: 1 },
      },
      { returnDocument: "after", session },
    );
    if (!claimed)
      throw new ApiError(
        409,
        "SUBMIT_CONFLICT",
        "This attempt was already submitted.",
      );
    const [attempt] = await SubmissionAttemptModel.create(
      [
        {
          submissionId: submission._id,
          assignmentId,
          classId,
          studentUserId: userId,
          attemptNumber: next,
          typedText: submission.draftText,
          fileIds: submission.draftFileIds,
          submittedAt: now,
          isLate,
          ...(assignment.rubric
            ? { rubricVersion: assignment.rubric.version }
            : {}),
          ...(rubricRevision
            ? {
                rubricRevisionId: rubricRevision._id,
                rubricRevisionNumber: rubricRevision.revisionNumber,
                rubricHash: rubricRevision.rubricHash,
              }
            : {}),
        },
      ],
      { session },
    );
    const [evaluation] = await SubmissionEvaluationModel.create([{
      submissionId: submission._id,
      attemptId: attempt!._id,
      assignmentId,
      classId,
      studentUserId: userId,
      ...(rubricRevision ? { rubricRevisionId: rubricRevision._id } : {}),
      ...(rubricRevision ? { rubricRevisionNumber: rubricRevision.revisionNumber } : {}),
      sourceFileIds: submission.draftFileIds,
      status: "PENDING",
      transcribedText: "",
      effectiveText: "",
      issues: [],
      correctionStats: {},
      legendSummary: [],
      strengths: [],
      feedbackSections: [],
    }], { session });
    return { claimed, attemptId: attempt!._id.toString(), attemptNumber: attempt!.attemptNumber, submittedAt: attempt!.submittedAt, evaluationId: evaluation!._id.toString() };
  });
  queueEvaluation(result.attemptId);
  return {
    submission: await details(result.claimed, assignment!),
    attempt: { id: result.attemptId, attemptNumber: result.attemptNumber, submittedAt: result.submittedAt.toISOString() },
    evaluation: { id: result.evaluationId, status: "PENDING" as const },
  };
}
export async function createUploadIntent(
  assignmentId: string,
  classId: string,
  userId: string,
  input: UploadIntentInput,
): Promise<UploadIntentDto> {
  const assignment = await policy(assignmentId, classId);
  if (input.sizeBytes > env.SUBMISSION_MAX_FILE_BYTES)
    throw new ApiError(
      413,
      "FILE_TOO_LARGE",
      "This file exceeds the upload limit.",
    );
  const submission = await aggregate(assignment, userId, classId);
  const current = await SubmissionFileModel.find({
    submissionId: submission!._id,
    status: { $in: ["PENDING", "READY"] },
  })
    .lean()
    .exec();
  if (current.length >= env.SUBMISSION_MAX_FILES)
    throw new ApiError(
      409,
      "FILE_LIMIT_REACHED",
      "Maximum file count reached.",
    );
  if (
    current.reduce((n, f) => n + f.sizeBytes, 0) + input.sizeBytes >
    env.SUBMISSION_MAX_TOTAL_BYTES
  )
    throw new ApiError(
      413,
      "FILES_TOO_LARGE",
      "Combined attachments exceed the allowed size.",
    );
  const key = `submissions/${classId}/${assignmentId}/${userId}/${randomUUID()}`,
    expiresAt = new Date(Date.now() + env.R2_PRESIGN_TTL_SECONDS * 1000);
  const file = await SubmissionFileModel.create({
    ownerUserId: userId,
    classId,
    assignmentId,
    submissionId: submission!._id,
    objectKey: key,
    originalName: cleanName(input.filename),
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    status: "PENDING",
    expiresAt,
  });
  const storage = await getObjectStorage();
  const uploadUrl = await storage.createUploadUrl({
    key,
    contentType: input.mimeType,
    expiresIn: env.R2_PRESIGN_TTL_SECONDS,
  });
  return {
    file: fileDto(file),
    uploadUrl,
    expiresAt: expiresAt.toISOString(),
    requiredHeaders: { "content-type": input.mimeType },
  };
}
export async function finalizeFile(fileId: string, userId: string) {
  const file = await SubmissionFileModel.findOne({
    _id: fileId,
    ownerUserId: userId,
    status: "PENDING",
  }).select("+objectKey");
  if (!file) throw new ApiError(404, "FILE_NOT_FOUND", "File not found.");
  const storage = await getObjectStorage(),
    head = await storage.headObject(file.objectKey);
  if (
    !head ||
    head.sizeBytes !== file.sizeBytes ||
    head.contentType !== file.mimeType
  ) {
    await storage.deleteObject(file.objectKey).catch(() => undefined);
    file.status = "REJECTED";
    await file.save();
    throw new ApiError(
      400,
      "UPLOAD_MISMATCH",
      "Uploaded file metadata did not match the upload request.",
    );
  }
  file.status = "READY";
  file.finalizedAt = new Date();
  await file.save();
  return fileDto(file);
}
export async function removeFile(fileId: string, userId: string) {
  const file = await SubmissionFileModel.findOne({
    _id: fileId,
    ownerUserId: userId,
    status: { $in: ["PENDING", "READY"] },
  }).select("+objectKey");
  if (!file) throw new ApiError(404, "FILE_NOT_FOUND", "File not found.");
  await SubmissionModel.updateOne(
    { _id: file.submissionId },
    { $pull: { draftFileIds: file._id } },
  );
  const used = await SubmissionAttemptModel.exists({ fileIds: file._id });
  if (!used) {
    const storage = await getObjectStorage();
    await storage.deleteObject(file.objectKey);
    file.status = "DELETED";
    await file.save();
  }
  return { removed: true, historical: Boolean(used) };
}
export async function fileContent(
  fileId: string,
  userId: string,
  disposition: "inline" | "attachment",
) {
  const file = await SubmissionFileModel.findOne({
    _id: fileId,
    status: "READY",
  }).select("+objectKey");
  if (!file) throw new ApiError(404, "FILE_NOT_FOUND", "File not found.");
  const own = file.ownerUserId.toString() === userId;
  const teacher = await ClassMembershipModel.exists({
    classId: file.classId,
    userId,
    status: "ACTIVE",
    role: { $in: ["OWNER", "TEACHER"] },
  });
  if (!own && !teacher)
    throw new ApiError(404, "FILE_NOT_FOUND", "File not found.");
  const storage = await getObjectStorage();
  return storage.createDownloadUrl({
    key: file.objectKey,
    filename: file.originalName,
    contentType: file.mimeType,
    disposition,
    expiresIn: Math.min(env.R2_PRESIGN_TTL_SECONDS, 300),
  });
}
export async function teacherSubmissions(
  assignmentId: string,
  classId: string,
  page: number,
  limit: number,
  search: string,
  filter: string,
) {
  const assignment = await policy(assignmentId, classId);
  const memberships = await ClassMembershipModel.find({
    classId,
    status: "ACTIVE",
    role: "STUDENT",
  })
    .select("userId")
    .lean()
    .exec();
  const userIds = memberships.map((m) => m.userId);
  const query = search
    ? {
        $or: [
          {
            displayName: {
              $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
              $options: "i",
            },
          },
          {
            email: {
              $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
              $options: "i",
            },
          },
        ],
      }
    : {};
  const users = await UserModel.find({ _id: { $in: userIds }, ...query })
    .sort({ displayName: 1 })
    .lean()
    .exec();
  const submissions = await SubmissionModel.find({
    assignmentId,
    studentUserId: { $in: users.map((u) => u._id) },
  })
    .lean()
    .exec();
  const map = new Map(submissions.map((s) => [s.studentUserId.toString(), s]));
  let rows: TeacherSubmissionRow[] = users.map((user) => {
    const s = map.get(user._id.toString());
    return {
      ...(s ? { submissionId: s._id.toString() } : {}),
      student: {
        id: user._id.toString(),
        displayName: user.displayName,
        email: user.email,
        ...(user.photoURL ? { photoURL: user.photoURL } : {}),
      },
      status: s?.latestAttemptNumber ? "SUBMITTED" : "NOT_SUBMITTED",
      latestAttemptNumber: s?.latestAttemptNumber ?? 0,
      ...(s?.latestSubmittedAt
        ? {
            latestSubmittedAt: s.latestSubmittedAt.toISOString(),
            isLate: Boolean(
              assignment.dueAt && s.latestSubmittedAt > assignment.dueAt,
            ),
          }
        : {}),
    };
  });
  if (filter === "SUBMITTED")
    rows = rows.filter((r) => r.status === "SUBMITTED");
  if (filter === "NOT_SUBMITTED")
    rows = rows.filter((r) => r.status === "NOT_SUBMITTED");
  if (filter === "LATE") rows = rows.filter((r) => r.isLate);
  if (filter === "MULTIPLE")
    rows = rows.filter((r) => r.latestAttemptNumber > 1);
  const total = rows.length,
    summary = {
      students: users.length,
      submitted: rows.filter((r) => r.status === "SUBMITTED").length,
      notSubmitted: rows.filter((r) => r.status === "NOT_SUBMITTED").length,
      late: rows.filter((r) => r.isLate).length,
    };
  return {
    rows: rows.slice((page - 1) * limit, page * limit),
    page,
    limit,
    total,
    summary,
  };
}
export async function teacherSubmissionDetail(
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
  const assignment = await AssignmentModel.findById(submission.assignmentId)
    .lean()
    .exec();
  return details(submission, assignment!);
}
