import pino from "pino";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { getObjectStorage } from "../storage/object-storage.js";
import { SubmissionFileModel } from "../modules/submissions/submission-file.model.js";

const logger = pino();
try {
  await connectDatabase();
  const files = await SubmissionFileModel.find({
    status: "PENDING",
    expiresAt: { $lt: new Date() },
  })
    .select("+objectKey")
    .limit(500);
  const storage = await getObjectStorage();
  let removed = 0;
  for (const file of files) {
    await storage.deleteObject(file.objectKey).catch(() => undefined);
    file.status = "DELETED";
    await file.save();
    removed += 1;
  }
  logger.info({ removed }, "stale pending submission uploads cleaned");
} finally {
  await disconnectDatabase();
}
