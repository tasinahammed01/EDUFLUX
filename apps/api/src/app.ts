import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import * as helmetModule from "helmet";
import { pinoHttp } from "pino-http";
import type { RequestHandler } from "express";

type HelmetFactory = () => RequestHandler;

function resolveHelmetFactory(value: unknown): HelmetFactory {
  let candidate: unknown = value;

  for (
    let depth = 0;
    depth < 2 && typeof candidate !== "function";
    depth += 1
  ) {
    if (
      candidate !== null &&
      typeof candidate === "object" &&
      "default" in candidate
    ) {
      candidate = (candidate as { default: unknown }).default;
      continue;
    }

    break;
  }

  if (typeof candidate !== "function") {
    throw new TypeError("Helmet module did not expose a callable factory.");
  }

  return candidate as HelmetFactory;
}

const helmet = resolveHelmetFactory(helmetModule);
import { randomUUID } from "node:crypto";
import type { HealthResponse } from "@eduflux/shared-types";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { classRouter } from "./modules/classes/class.routes.js";
import { isDatabaseReady, ensureDatabaseConnection } from "./config/database.js";
import { isFirebaseAdminReady } from "./config/firebase-admin.js";
import { submissionFileRouter } from "./modules/submissions/submission-file.routes.js";

if (env.NODE_ENV !== "test") {
  ensureDatabaseConnection().catch((error) => {
    console.error("Failed to initialize database connection:", error.message);
  });
}

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY_HOPS);
app.use(helmet());
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(
  pinoHttp({
    level: env.LOG_LEVEL,
    autoLogging: env.NODE_ENV !== "test",
    genReqId: (request, response) => {
      const id =
        request.headers["x-request-id"]?.toString().slice(0, 100) ||
        randomUUID();
      response.setHeader("x-request-id", id);
      return id;
    },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.x-csrf-token",
        "req.body.idToken",
        "req.body.password",
        "req.body.typedText",
        "req.body.uploadUrl",
        "password",
        "passwordHash",
        "sessionToken",
        "csrfToken",
        "token",
        "inviteToken",
        "secret",
      ],
      censor: "[REDACTED]",
    },
  }),
);

app.get("/health", (_request, response) => {
  const payload: HealthResponse = {
    status: "ok",
    timestamp: new Date().toISOString(),
  };
  response.json(payload);
});
app.get("/health/live", (_request, response) =>
  response.json({ status: "ok" }),
);
app.get("/health/ready", (request, response) => {
  const dbReady = isDatabaseReady();
  const firebaseReady = isFirebaseAdminReady();

  if (!dbReady || !firebaseReady) {
    const unavailable = [];
    if (!dbReady) unavailable.push("database");
    if (!firebaseReady) unavailable.push("firebase");

    const logger = (request as any).log;
    if (logger) {
      logger.warn({
        databaseReady: dbReady,
        firebaseReady: firebaseReady,
        unavailable
      }, "Health check failed - dependencies not ready");
    }

    response.status(503).json({ status: "unavailable" });
    return;
  }

  response.json({ status: "ok" });
});
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/classes", classRouter);
app.use("/api/v1/submission-files", submissionFileRouter);

app.use((_request, response) =>
  response.status(404).json({
    data: null,
    error: { code: "NOT_FOUND", message: "Resource not found." },
  }),
);
app.use(errorHandler);

export default app;
