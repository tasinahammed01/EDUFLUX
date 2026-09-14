import pino from "pino";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { UserModel } from "../modules/users/user.model.js";
import { ClassModel } from "../modules/classes/class.model.js";
import { ClassMembershipModel } from "../modules/classes/class-membership.model.js";

const logger = pino();
try {
  await connectDatabase();
  for (const model of [UserModel, ClassModel, ClassMembershipModel]) await model.createIndexes();
  logger.info("EduFlux indexes created without dropping existing indexes");
} finally { await disconnectDatabase(); }
