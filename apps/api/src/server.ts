import pino from "pino";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";

const logger = pino({ level: env.LOG_LEVEL });
await connectDatabase();
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
