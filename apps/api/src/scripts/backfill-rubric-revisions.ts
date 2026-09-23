import pino from "pino";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { AssignmentModel } from "../modules/assignments/assignment.model.js";
import { RubricRevisionModel } from "../modules/assignments/rubric-revision.model.js";
import { hashRubric, rubricMaxScore } from "../modules/assignments/rubric-revision.service.js";
import { validateRubric } from "../modules/assignments/rubric.service.js";

const logger = pino();
const write = process.argv.includes("--write");
const counters = {
  scanned: 0,
  created: 0,
  alreadyMigrated: 0,
  skippedNoRubric: 0,
  invalid: 0,
  failed: 0,
};

try {
  await connectDatabase();
  const cursor = AssignmentModel.find({}).cursor();
  for await (const assignment of cursor) {
    counters.scanned += 1;
    if (!assignment.rubric) {
      counters.skippedNoRubric += 1;
      continue;
    }
    try {
      const rubric = validateRubric(assignment.rubric);
      const rubricHash = hashRubric(rubric);
      const existing = assignment.currentRubricRevisionId
        ? await RubricRevisionModel.findById(assignment.currentRubricRevisionId).lean().exec()
        : await RubricRevisionModel.findOne({ assignmentId: assignment._id, rubricHash }).lean().exec();
      if (existing) {
        counters.alreadyMigrated += 1;
        if (write && !assignment.currentRubricRevisionId) {
          await AssignmentModel.updateOne(
            { _id: assignment._id, currentRubricRevisionId: { $exists: false } },
            {
              $set: {
                currentRubricRevisionId: existing._id,
                currentRubricRevisionNumber: existing.revisionNumber,
                maxScore: existing.maxScore,
              },
            },
          ).exec();
        }
        continue;
      }
      if (!write) {
        counters.created += 1;
        continue;
      }
      const revision = await new RubricRevisionModel({
        assignmentId: assignment._id,
        classId: assignment.classId,
        revisionNumber: 1,
        rubric,
        rubricHash,
        maxScore: rubricMaxScore(rubric),
        createdByUserId: assignment.createdByUserId,
      }).save();
      await AssignmentModel.updateOne(
        { _id: assignment._id, currentRubricRevisionId: { $exists: false } },
        {
          $set: {
            currentRubricRevisionId: revision._id,
            currentRubricRevisionNumber: 1,
            maxScore: revision.maxScore,
          },
        },
      ).exec();
      counters.created += 1;
    } catch (error) {
      if (error instanceof Error && error.name === "ApiError") counters.invalid += 1;
      else counters.failed += 1;
      logger.warn({ assignmentId: assignment._id.toString(), error: error instanceof Error ? error.message : "unknown" }, "rubric revision backfill skipped assignment");
    }
  }
  logger.info({ mode: write ? "write" : "dry-run", ...counters }, "rubric revision backfill complete");
} finally {
  await disconnectDatabase();
}
