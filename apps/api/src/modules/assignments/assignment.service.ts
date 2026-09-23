import type { AssignmentDto, StudentAssignmentSubmissionSummary } from "@eduflux/shared-types";
import type { AssignmentInput, UpdateAssignmentInput } from "@eduflux/validation";
import { ApiError } from "../../utils/api-error.js";
import { findAssignment, insertAssignment, listAssignments, updateAssignment, removeAssignment } from "./assignment.repository.js";
import { findClassById } from "../classes/class.repository.js";
import type { AssignmentRecord } from "./assignment.model.js";
import { SubmissionAttemptModel } from "../submissions/submission-attempt.model.js";
import { SubmissionModel } from "../submissions/submission.model.js";
import { SubmissionFileModel } from "../submissions/submission-file.model.js";
import { ClassMembershipModel } from "../classes/class-membership.model.js";
import { saveRubric, validateRubric } from "./rubric.service.js";
import { RubricRevisionModel } from "./rubric-revision.model.js";
import { SubmissionEvaluationModel } from "../submissions/submission-evaluation.model.js";

type DtoOptions = {
  includeRubric?: boolean;
  rubricLocked?: boolean;
  submissionStats?: AssignmentDto["submissionStats"];
  studentSubmission?: StudentAssignmentSubmissionSummary;
};

export function mapAssignmentDto(item: AssignmentRecord, options: DtoOptions = {}): AssignmentDto {
  let rubric;
  if (item.rubric && options.includeRubric !== false) {
    if ("levels" in item.rubric && Array.isArray(item.rubric.levels)) {
      rubric = {
        ...item.rubric,
        totalWeight: item.rubric.criteria.reduce((sum, criterion) => sum + criterion.weight, 0),
      };
    } else {
      const oldRubric = item.rubric as any;
      const levels = oldRubric.criteria?.[0]?.performanceLevels?.map((level: any) => ({
        id: level.id,
        label: level.label,
        ...(level.description ? { description: level.description } : {}),
        percentage: Math.round((level.points / oldRubric.criteria[0].maxPoints) * 100),
      })) ?? [];
      const denominator = oldRubric.criteria?.reduce((sum: number, criterion: any) => sum + criterion.maxPoints, 0) || 1;
      const criteria = oldRubric.criteria?.map((criterion: any) => ({
        id: criterion.id,
        title: criterion.title,
        ...(criterion.description ? { description: criterion.description } : {}),
        weight: Math.round((criterion.maxPoints / denominator) * 100),
        descriptors: criterion.performanceLevels?.map((level: any) => level.description || "") ?? levels.map(() => ""),
      })) ?? [];
      rubric = {
        version: 1,
        title: oldRubric.title || `${item.title} Rubric`,
        description: oldRubric.description || "",
        levels,
        criteria,
        totalWeight: criteria.reduce((sum: number, criterion: any) => sum + criterion.weight, 0),
      };
    }
  }

  return {
    id: item._id.toString(),
    classId: item.classId.toString(),
    title: item.title,
    ...(item.description ? { description: item.description } : {}),
    ...(item.instructions ? { instructions: item.instructions } : {}),
    status: item.status,
    ...(item.availableFrom ? { availableFrom: item.availableFrom.toISOString() } : {}),
    ...(item.dueAt ? { dueAt: item.dueAt.toISOString() } : {}),
    maxScore: item.maxScore,
    allowLateSubmission: item.allowLateSubmission,
    allowResubmission: item.allowResubmission,
    ...(item.maxAttempts ? { maxAttempts: item.maxAttempts } : {}),
    showMarks: item.showMarks,
    hasRubric: Boolean(item.currentRubricRevisionId || item.rubric),
    ...(item.currentRubricRevisionNumber ? { rubricRevisionNumber: item.currentRubricRevisionNumber } : {}),
    ...(options.rubricLocked !== undefined ? { rubricLocked: options.rubricLocked } : {}),
    ...(rubric ? { rubric } : {}),
    ...(options.submissionStats ? { submissionStats: options.submissionStats } : {}),
    ...(options.studentSubmission ? { studentSubmission: options.studentSubmission } : {}),
    resourceLinks: item.resourceLinks,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    ...(item.publishedAt ? { publishedAt: item.publishedAt.toISOString() } : {}),
  };
}

export async function createAssignment(classId: string, userId: string, input: AssignmentInput) {
  const klass = await findClassById(classId);
  if (!klass || klass.status === "ARCHIVED") {
    throw new ApiError(409, "CLASS_ARCHIVED", "Archived classes cannot accept assignments.");
  }
  const { rubric, ...fields } = input;
  const created = await insertAssignment({
    classId,
    createdByUserId: userId,
    ...fields,
    maxScore: 100,
    ...(input.availableFrom ? { availableFrom: new Date(input.availableFrom) } : {}),
    ...(input.dueAt ? { dueAt: new Date(input.dueAt) } : {}),
    status: "DRAFT",
  });
  if (!rubric) return mapAssignmentDto(created);
  return mapAssignmentDto(await saveRubric(created._id.toString(), classId, userId, rubric));
}

export async function getAssignments(
  classId: string,
  student: boolean,
  page: number,
  limit: number,
  userId: string,
) {
  const [items, total] = await listAssignments(classId, student, page, limit);
  const assignmentIds = items.map((item) => item._id);
  if (student) {
    const [submissions, attempts, evaluations] = await Promise.all([
      SubmissionModel.find({ assignmentId: { $in: assignmentIds }, studentUserId: userId }).lean().exec(),
      SubmissionAttemptModel.find({ assignmentId: { $in: assignmentIds }, studentUserId: userId }).sort({ attemptNumber: -1 }).select("assignmentId _id attemptNumber").lean().exec(),
      SubmissionEvaluationModel.find({ assignmentId: { $in: assignmentIds }, studentUserId: userId }).sort({ createdAt: -1 }).select("assignmentId attemptId status").lean().exec(),
    ]);
    const byAssignment = new Map(submissions.map((submission) => [submission.assignmentId.toString(), submission]));
    const latestAttempt = new Map<string, (typeof attempts)[number]>();
    for (const attempt of attempts) if (!latestAttempt.has(attempt.assignmentId.toString())) latestAttempt.set(attempt.assignmentId.toString(), attempt);
    const evaluationByAttempt = new Map(evaluations.map((evaluation) => [evaluation.attemptId.toString(), evaluation]));
    return {
      assignments: items.map((item) => {
        const submission = byAssignment.get(item._id.toString());
        const max = item.allowResubmission ? (item.maxAttempts ?? Number.MAX_SAFE_INTEGER) : 1;
        const isLate = Boolean(item.dueAt && submission?.latestSubmittedAt && submission.latestSubmittedAt > item.dueAt);
        const submissionWindowOpen = !item.dueAt || new Date() <= item.dueAt || item.allowLateSubmission;
        const attempt = latestAttempt.get(item._id.toString());
        const evaluation = attempt ? evaluationByAttempt.get(attempt._id.toString()) : undefined;
        const summary: StudentAssignmentSubmissionSummary = {
          assignmentId: item._id.toString(),
          ...(submission ? { submissionId: submission._id.toString(), draftRevision: submission.draftRevision } : {}),
          submissionState: !submission ? "NONE" : submission.latestAttemptNumber > 0 ? "SUBMITTED" : "DRAFT",
          latestAttemptNumber: submission?.latestAttemptNumber ?? 0,
          ...(attempt ? { latestAttemptId: attempt._id.toString() } : {}),
          ...(evaluation ? { evaluationStatus: evaluation.status } : {}),
          ...(submission?.latestSubmittedAt ? { latestSubmittedAt: submission.latestSubmittedAt.toISOString() } : {}),
          canResubmit: Boolean(submission?.latestAttemptNumber && submission.latestAttemptNumber < max && submissionWindowOpen),
          isLate,
        };
        return mapAssignmentDto(item, { includeRubric: false, studentSubmission: summary });
      }),
      page,
      limit,
      total,
    };
  }

  const [eligibleStudentCount, submissions] = await Promise.all([
    ClassMembershipModel.countDocuments({ classId, status: "ACTIVE", role: "STUDENT" }).exec(),
    SubmissionModel.find({ assignmentId: { $in: assignmentIds }, latestAttemptNumber: { $gt: 0 } })
      .select("assignmentId latestSubmittedAt studentUserId")
      .lean()
      .exec(),
  ]);
  const stats = new Map<string, { submittedCount: number; lateCount: number }>();
  const assignmentsById = new Map(items.map((item) => [item._id.toString(), item]));
  for (const submission of submissions) {
    const id = submission.assignmentId.toString();
    const current = stats.get(id) ?? { submittedCount: 0, lateCount: 0 };
    current.submittedCount += 1;
    const assignment = assignmentsById.get(id);
    if (assignment?.dueAt && submission.latestSubmittedAt && submission.latestSubmittedAt > assignment.dueAt) current.lateCount += 1;
    stats.set(id, current);
  }
  return {
    assignments: items.map((item) => {
      const value = stats.get(item._id.toString()) ?? { submittedCount: 0, lateCount: 0 };
      return mapAssignmentDto(item, {
        includeRubric: false,
        rubricLocked: value.submittedCount > 0,
        submissionStats: { eligibleStudentCount, ...value },
      });
    }),
    page,
    limit,
    total,
  };
}

export async function getAssignment(id: string, classId: string, student: boolean) {
  const item = await findAssignment(id);
  if (!item || item.classId.toString() !== classId || (student && item.status !== "PUBLISHED")) {
    throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
  }
  return mapAssignmentDto(item, { rubricLocked: Boolean(await SubmissionAttemptModel.exists({ assignmentId: id })) });
}

export async function editAssignment(id: string, classId: string, userId: string, input: UpdateAssignmentInput) {
  const existing = await findAssignment(id);
  if (!existing || existing.classId.toString() !== classId) throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
  if (input.rubric !== undefined && (await SubmissionAttemptModel.exists({ assignmentId: id }))) {
    throw new ApiError(409, "RUBRIC_LOCKED", "This rubric is locked because students have already submitted work.");
  }
  const available = input.availableFrom ? new Date(input.availableFrom) : existing.availableFrom;
  const due = input.dueAt ? new Date(input.dueAt) : existing.dueAt;
  if (available && due && due <= available) {
    throw new ApiError(400, "VALIDATION_ERROR", "Please check the submitted fields.", { dueAt: ["Due date must be after availability."] });
  }
  const { rubric, ...fields } = input;
  const item = await updateAssignment(id, {
    ...fields,
    ...(input.availableFrom ? { availableFrom: new Date(input.availableFrom) } : {}),
    ...(input.dueAt ? { dueAt: new Date(input.dueAt) } : {}),
  });
  if (!item) throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
  return mapAssignmentDto(rubric ? await saveRubric(id, classId, userId, rubric) : item);
}

export async function publishAssignment(id: string, classId: string, userId: string) {
  let existing: AssignmentRecord | null = await findAssignment(id);
  if (!existing || existing.classId.toString() !== classId) throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
  let rubric;
  let rubricMaxScore: number;
  if (existing.currentRubricRevisionId) {
    const revision = await RubricRevisionModel.findOne({
      _id: existing.currentRubricRevisionId,
      assignmentId: id,
      classId,
    }).lean().exec();
    if (!revision) throw new ApiError(409, "RUBRIC_REVISION_UNAVAILABLE", "The current rubric revision is unavailable. Save the rubric again before publishing.");
    rubric = validateRubric(revision.rubric);
    rubricMaxScore = revision.maxScore;
  } else {
    if (!existing.rubric?.criteria.length) throw new ApiError(400, "RUBRIC_REQUIRED", "Add a rubric before publishing this assignment.");
    rubric = validateRubric(existing.rubric);
    if (await SubmissionAttemptModel.exists({ assignmentId: id })) {
      // Legacy assignments may have uncertain history; retain fallback rather than fabricate linkage.
    } else {
      existing = await saveRubric(id, classId, userId, rubric);
    }
    rubricMaxScore = rubric.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  }
  if (existing.status === "PUBLISHED") return mapAssignmentDto(existing);
  return mapAssignmentDto((await updateAssignment(id, {
    status: "PUBLISHED",
    ...(existing.publishedAt ? {} : { publishedAt: new Date() }),
    archivedAt: null,
    maxScore: rubricMaxScore,
  }))!);
}

export async function archiveAssignment(id: string, classId: string) {
  const existing = await findAssignment(id);
  if (!existing || existing.classId.toString() !== classId) throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
  if (existing.status === "ARCHIVED") return mapAssignmentDto(existing);
  return mapAssignmentDto((await updateAssignment(id, { status: "ARCHIVED", archivedAt: new Date() }))!);
}

export async function deleteAssignment(id: string, classId: string) {
  const existing = await findAssignment(id);
  if (!existing || existing.classId.toString() !== classId) throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
  if (await SubmissionAttemptModel.exists({ assignmentId: id })) {
    throw new ApiError(409, "ASSIGNMENT_HAS_SUBMISSIONS", "Assignments with student submissions cannot be permanently deleted. Archive it instead.");
  }
  const [hasDrafts, hasFiles] = await Promise.all([
    SubmissionModel.exists({ assignmentId: id }),
    SubmissionFileModel.exists({ assignmentId: id, status: { $ne: "DELETED" } }),
  ]);
  if (hasDrafts || hasFiles) {
    throw new ApiError(409, "ASSIGNMENT_HAS_DRAFTS", "This assignment has student drafts or uploads. Archive it instead.");
  }
  await removeAssignment(id);
  return { id, deleted: true };
}
