import pino from "pino";
import { app } from "./app.js";
import { env, googleCredentialSource } from "./config/env.js";
import { existsSync } from "node:fs";
import { ensureDatabaseConnection, disconnectDatabase } from "./config/database.js";

const logger = pino({ level: env.LOG_LEVEL });

if (env.NODE_ENV === "development") logger.info({
  provider: env.OCR_PROVIDER,
  credentialSource: googleCredentialSource,
  credentialPath: env.GOOGLE_APPLICATION_CREDENTIALS,
  credentialFileExists: Boolean(env.GOOGLE_APPLICATION_CREDENTIALS && existsSync(env.GOOGLE_APPLICATION_CREDENTIALS)),
}, "OCR configuration");
await ensureDatabaseConnection();
const server = app.listen(env.PORT, () => logger.info({ port: env.PORT, database: "connected" }, "EduFlux API listening"));

function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down");
  server.close(async (error) => {
    if (error) {
      logger.error(error, "Shutdown failed");
      process.exitCode = 1;
    }
    await disconnectDatabase();
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
