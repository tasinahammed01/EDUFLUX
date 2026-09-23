import mongoose from "mongoose";
import type { AssignmentRecord } from "./assignment.model.js";
import { AssignmentModel } from "./assignment.model.js";
import { ApiError } from "../../utils/api-error.js";
import { rubricSchema } from "@eduflux/validation";
import { SubmissionAttemptModel } from "../submissions/submission-attempt.model.js";
import { RubricRevisionModel } from "./rubric-revision.model.js";
import {
  findCurrentRubricRevision,
  hashRubric,
  normalizeRubric,
  rubricMaxScore,
  type NormalizedRubric,
} from "./rubric-revision.service.js";

export function validateRubric(rubric: unknown): NormalizedRubric {
  const result = rubricSchema.safeParse(rubric);
  if (!result.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid rubric structure.", result.error.flatten().fieldErrors);
  }
  return normalizeRubric(result.data);
}

export async function canModifyRubric(assignmentId: string): Promise<boolean> {
  return !(await SubmissionAttemptModel.exists({ assignmentId }));
}

export async function saveRubric(
  assignmentId: string,
  classId: string,
  createdByUserId: string,
  rubric: unknown,
): Promise<AssignmentRecord> {
  const validatedRubric = validateRubric(rubric);
  const rubricHash = hashRubric(validatedRubric);
  const maxScore = rubricMaxScore(validatedRubric);

  return mongoose.connection.transaction(async (session) => {
    const existing = await AssignmentModel.findOne({ _id: assignmentId, classId }).session(session).exec();
    if (!existing) throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
    if (await SubmissionAttemptModel.exists({ assignmentId }).session(session)) {
      throw new ApiError(409, "RUBRIC_LOCKED", "This rubric is locked because students have already submitted work.");
    }

    const current = await findCurrentRubricRevision(existing.currentRubricRevisionId?.toString(), assignmentId, session);
    if (current?.rubricHash === rubricHash) return existing.toObject();

    const duplicate = await RubricRevisionModel.findOne({ assignmentId, rubricHash }).session(session).exec();
    if (duplicate) {
      existing.currentRubricRevisionId = duplicate._id;
      existing.currentRubricRevisionNumber = duplicate.revisionNumber;
      existing.rubric = duplicate.rubric;
      existing.maxScore = duplicate.maxScore;
      await existing.save({ session });
      return existing.toObject();
    }

    const latest = await RubricRevisionModel.findOne({ assignmentId }).sort({ revisionNumber: -1 }).session(session).exec();
    const revisionNumber = (latest?.revisionNumber ?? 0) + 1;
    const revision = await new RubricRevisionModel({
        assignmentId,
        classId,
        revisionNumber,
        rubric: validatedRubric,
        rubricHash,
        maxScore,
        createdByUserId,
        ...(latest ? { supersedesRevisionId: latest._id } : {}),
      }).save({ session });

    existing.currentRubricRevisionId = revision._id;
    existing.currentRubricRevisionNumber = revisionNumber;
    // Transitional dual-write. RubricRevision is canonical for new writes.
    existing.rubric = validatedRubric;
    existing.maxScore = maxScore;
    await existing.save({ session });
    return existing.toObject();
  });
}

export async function getRubricWithLockStatus(
  assignmentId: string,
  classId: string,
): Promise<{ rubric: AssignmentRecord["rubric"]; locked: boolean; rubricRevisionNumber?: number }> {
  const existing = await AssignmentModel.findOne({ _id: assignmentId, classId }).lean().exec();
  if (!existing) throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
  const revision = await findCurrentRubricRevision(existing.currentRubricRevisionId?.toString(), assignmentId);
  return {
    rubric: revision?.rubric ?? existing.rubric,
    locked: !(await canModifyRubric(assignmentId)),
    ...(revision
      ? { rubricRevisionNumber: revision.revisionNumber }
      : existing.currentRubricRevisionNumber
        ? { rubricRevisionNumber: existing.currentRubricRevisionNumber }
        : {}),
  };
}
