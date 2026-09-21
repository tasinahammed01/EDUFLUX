import pino from "pino";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { UserModel } from "../modules/users/user.model.js";
import { ClassModel } from "../modules/classes/class.model.js";
import { ClassMembershipModel } from "../modules/classes/class-membership.model.js";
import { AssignmentModel } from "../modules/assignments/assignment.model.js";
import { SubmissionModel } from "../modules/submissions/submission.model.js";
import { SubmissionAttemptModel } from "../modules/submissions/submission-attempt.model.js";
import { SubmissionFileModel } from "../modules/submissions/submission-file.model.js";
import { RubricTemplateModel } from "../modules/rubrics/rubric-template.model.js";

const logger = pino();
try {
  await connectDatabase();
  for (const model of [
    UserModel,
    ClassModel,
    ClassMembershipModel,
    AssignmentModel,
    SubmissionModel,
    SubmissionAttemptModel,
    SubmissionFileModel,
    RubricTemplateModel,
  ])
    await model.createIndexes();
  logger.info("EduFlux indexes created without dropping existing indexes");
} finally {
  await disconnectDatabase();
}
