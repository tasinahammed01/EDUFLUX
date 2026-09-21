import type { AssignmentDto } from "@eduflux/shared-types";
import type {
  AssignmentInput,
  UpdateAssignmentInput,
} from "@eduflux/validation";
import { ApiError } from "../../utils/api-error.js";
import {
  findAssignment,
  insertAssignment,
  listAssignments,
  updateAssignment,
} from "./assignment.repository.js";
import { findClassById } from "../classes/class.repository.js";
import type { AssignmentRecord } from "./assignment.model.js";
import { SubmissionAttemptModel } from "../submissions/submission-attempt.model.js";
function dto(item: AssignmentRecord): AssignmentDto {
  const rubric = item.rubric
    ? {
        ...item.rubric,
        totalPoints: item.rubric.criteria.reduce(
          (sum, criterion) => sum + criterion.maxPoints,
          0,
        ),
      }
    : undefined;
  return {
    id: item._id.toString(),
    classId: item.classId.toString(),
    title: item.title,
    ...(item.description ? { description: item.description } : {}),
    ...(item.instructions ? { instructions: item.instructions } : {}),
    status: item.status,
    ...(item.availableFrom
      ? { availableFrom: item.availableFrom.toISOString() }
      : {}),
    ...(item.dueAt ? { dueAt: item.dueAt.toISOString() } : {}),
    maxScore: item.maxScore,
    allowLateSubmission: item.allowLateSubmission,
    allowResubmission: item.allowResubmission,
    ...(item.maxAttempts ? { maxAttempts: item.maxAttempts } : {}),
    showMarks: item.showMarks,
    ...(rubric ? { rubric } : {}),
    resourceLinks: item.resourceLinks,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    ...(item.publishedAt
      ? { publishedAt: item.publishedAt.toISOString() }
      : {}),
  };
}
export async function createAssignment(
  classId: string,
  userId: string,
  input: AssignmentInput,
) {
  const klass = await findClassById(classId);
  if (!klass || klass.status === "ARCHIVED")
    throw new ApiError(
      409,
      "CLASS_ARCHIVED",
      "Archived classes cannot accept assignments.",
    );
  return dto(
    await insertAssignment({
      classId,
      createdByUserId: userId,
      ...input,
      ...(input.availableFrom
        ? { availableFrom: new Date(input.availableFrom) }
        : {}),
      ...(input.dueAt ? { dueAt: new Date(input.dueAt) } : {}),
      status: "DRAFT",
    }),
  );
}
export async function getAssignments(
  classId: string,
  student: boolean,
  page: number,
  limit: number,
) {
  const [items, total] = await listAssignments(classId, student, page, limit);
  return { assignments: items.map(dto), page, limit, total };
}
export async function getAssignment(
  id: string,
  classId: string,
  student: boolean,
) {
  const item = await findAssignment(id);
  if (
    !item ||
    item.classId.toString() !== classId ||
    (student && item.status !== "PUBLISHED")
  )
    throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
  return dto(item);
}
export async function editAssignment(
  id: string,
  classId: string,
  input: UpdateAssignmentInput,
) {
  const existing = await findAssignment(id);
  if (!existing || existing.classId.toString() !== classId)
    throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
  if (
    (input.maxScore !== undefined || input.rubric !== undefined) &&
    (await SubmissionAttemptModel.exists({ assignmentId: id }))
  )
    throw new ApiError(
      409,
      "RUBRIC_LOCKED",
      "The rubric and maximum score cannot change after the first submission.",
    );
  const available = input.availableFrom
    ? new Date(input.availableFrom)
    : existing.availableFrom;
  const due = input.dueAt ? new Date(input.dueAt) : existing.dueAt;
  if (available && due && due <= available)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Please check the submitted fields.",
      { dueAt: ["Due date must be after availability."] },
    );
  const item = await updateAssignment(id, {
    ...input,
    ...(input.availableFrom
      ? { availableFrom: new Date(input.availableFrom) }
      : {}),
    ...(input.dueAt ? { dueAt: new Date(input.dueAt) } : {}),
  });
  return dto(item!);
}
export async function publishAssignment(id: string, classId: string) {
  const existing = await findAssignment(id);
  if (!existing || existing.classId.toString() !== classId)
    throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
  if (
    existing.rubric &&
    existing.rubric.criteria.reduce(
      (sum, criterion) => sum + criterion.maxPoints,
      0,
    ) !== existing.maxScore
  )
    throw new ApiError(
      400,
      "RUBRIC_TOTAL_MISMATCH",
      "Rubric total must equal the assignment maximum score.",
    );
  return dto(
    (await updateAssignment(id, {
      status: "PUBLISHED",
      publishedAt: new Date(),
      archivedAt: null,
    }))!,
  );
}
export async function archiveAssignment(id: string, classId: string) {
  const existing = await findAssignment(id);
  if (!existing || existing.classId.toString() !== classId)
    throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
  return dto(
    (await updateAssignment(id, {
      status: "ARCHIVED",
      archivedAt: new Date(),
    }))!,
  );
}
