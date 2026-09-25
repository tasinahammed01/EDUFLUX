import "dotenv/config";
import { existsSync } from "node:fs";
import { z } from "zod";
import { DEFAULT_API_PORT, DEFAULT_WEB_ORIGIN } from "@eduflux/config";
import { readLocalGoogleCredentialConfig, validateCredentialFile } from "./google-credentials.js";

const googleCredentials = readLocalGoogleCredentialConfig();

const optionalString = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    schema.optional(),
  );

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(DEFAULT_API_PORT),
    WEB_ORIGIN: z.url().default(DEFAULT_WEB_ORIGIN),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    MONGODB_URI: z
      .string()
      .min(1)
      .default(
        process.env.NODE_ENV === "test"
          ? "mongodb://127.0.0.1:27017/eduflux-test"
          : "",
      ),
    CSRF_SECRET: z
      .string()
      .min(32)
      .default(
        process.env.NODE_ENV === "test"
          ? "test-csrf-secret-at-least-32-characters"
          : "",
      ),
    FIREBASE_PROJECT_ID: optionalString(z.string().min(1)),
    FIREBASE_CLIENT_EMAIL: optionalString(z.string().email()),
    FIREBASE_PRIVATE_KEY: optionalString(z.string().min(1)),
    GOOGLE_APPLICATION_CREDENTIALS: optionalString(z.string().min(1)),
    GOOGLE_CLOUD_KEY_FILE: optionalString(z.string().min(1)),
    FIREBASE_SESSION_TTL_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(14)
      .default(7),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
    R2_ACCOUNT_ID: optionalString(z.string().min(1)),
    R2_ACCESS_KEY_ID: optionalString(z.string().min(1)),
    R2_SECRET_ACCESS_KEY: optionalString(z.string().min(1)),
    R2_BUCKET_NAME: optionalString(z.string().min(1)),
    R2_PRESIGN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(600)
      .default(300),
    SUBMISSION_MAX_FILE_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .default(15 * 1024 * 1024),
    SUBMISSION_MAX_TOTAL_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .default(50 * 1024 * 1024),
    SUBMISSION_MAX_FILES: z.coerce.number().int().min(1).max(10).default(5),
    AI_PROVIDER: z.enum(["openai", "openrouter", "gemini"]).default("openai"),
    AI_API_KEY: optionalString(z.string().min(20)),
    OPENROUTER_API_KEY: optionalString(z.string().min(20)),
    OPENROUTER_BASE_URL: z.url().default("https://openrouter.ai/api/v1"),
    AI_RUBRIC_MODEL: z.string().min(1).max(120).default("gpt-4o-mini"),
    AI_EVALUATION_MODEL: z.string().min(1).max(120).default("gpt-4o-mini"),
    OCR_PROVIDER: z.enum(["openai", "google-vision"]).default("google-vision"),
    OCR_API_KEY: optionalString(z.string().min(20)),
    OCR_MODEL: z.string().min(1).max(120).default("gpt-4o-mini"),
    OCR_LANGUAGE_HINTS: z.preprocess((value) => typeof value === "string" ? value.split(",").map((item) => item.trim()).filter(Boolean) : value, z.array(z.string().min(2).max(20)).max(10)).default(["en"]),
    OCR_ENABLE_HANDWRITING: z.preprocess((value) => typeof value === "string" ? value.toLowerCase() === "true" : value, z.boolean()).default(true),
    AI_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(60_000)
      .default(20_000),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "test") return;
    if (value.AI_PROVIDER === "openrouter" && !value.OPENROUTER_API_KEY) {
      context.addIssue({ code: "custom", message: "OPENROUTER_API_KEY is required when AI_PROVIDER=openrouter.", path: ["OPENROUTER_API_KEY"] });
    }
    if (value.OCR_PROVIDER === "google-vision" && !value.GOOGLE_APPLICATION_CREDENTIALS) {
      context.addIssue({ code: "custom", message: "GOOGLE_APPLICATION_CREDENTIALS is required when OCR_PROVIDER=google-vision.", path: ["GOOGLE_APPLICATION_CREDENTIALS"] });
    }
    const explicitCredentialCount = [
      value.FIREBASE_PROJECT_ID,
      value.FIREBASE_CLIENT_EMAIL,
      value.FIREBASE_PRIVATE_KEY,
    ].filter(Boolean).length;

    if (explicitCredentialCount > 0 && explicitCredentialCount < 3) {
      context.addIssue({
        code: "custom",
        message:
          "FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY must all be configured together.",
        path: ["FIREBASE_PRIVATE_KEY"],
      });
      return;
    }

    if (
      explicitCredentialCount === 0 &&
      !value.GOOGLE_APPLICATION_CREDENTIALS
    ) {
      context.addIssue({
        code: "custom",
        message: "Firebase Admin credentials are required.",
        path: ["FIREBASE_PRIVATE_KEY"],
      });
    } else if (
      explicitCredentialCount === 0 &&
      !existsSync(value.GOOGLE_APPLICATION_CREDENTIALS!)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "The configured Google application credentials file does not exist.",
        path: ["GOOGLE_APPLICATION_CREDENTIALS"],
      });
    }

    const r2Count = [
      value.R2_ACCOUNT_ID,
      value.R2_ACCESS_KEY_ID,
      value.R2_SECRET_ACCESS_KEY,
      value.R2_BUCKET_NAME,
    ].filter(Boolean).length;
    if (r2Count > 0 && r2Count < 4) {
      context.addIssue({
        code: "custom",
        message:
          "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME must all be configured together.",
        path: ["R2_SECRET_ACCESS_KEY"],
      });
    }
    if (value.NODE_ENV === "production" && r2Count !== 4) {
      context.addIssue({
        code: "custom",
        message: "Cloudflare R2 credentials are required in production.",
        path: ["R2_SECRET_ACCESS_KEY"],
      });
    }
  });

const environment = { ...process.env, ...(googleCredentials.resolvedPath ? { GOOGLE_APPLICATION_CREDENTIALS: googleCredentials.resolvedPath } : {}) };
export const env = schema.parse(environment);
if (env.NODE_ENV !== "test" && env.OCR_PROVIDER === "google-vision") validateCredentialFile(env.GOOGLE_APPLICATION_CREDENTIALS!);
export const googleCredentialSource = googleCredentials.source;
