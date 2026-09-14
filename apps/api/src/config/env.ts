import "dotenv/config";
import { existsSync } from "node:fs";
import { z } from "zod";
import { DEFAULT_API_PORT, DEFAULT_WEB_ORIGIN } from "@eduflux/config";

const optionalString = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, schema.optional());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(DEFAULT_API_PORT),
  WEB_ORIGIN: z.url().default(DEFAULT_WEB_ORIGIN),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  MONGODB_URI: z.string().min(1).default(process.env.NODE_ENV === "test" ? "mongodb://127.0.0.1:27017/eduflux-test" : ""),
  CSRF_SECRET: z.string().min(32).default(process.env.NODE_ENV === "test" ? "test-csrf-secret-at-least-32-characters" : ""),
  FIREBASE_PROJECT_ID: z.string().min(1).default(process.env.NODE_ENV === "test" ? "eduflux-test" : ""),
  FIREBASE_CLIENT_EMAIL: optionalString(z.string().email()),
  FIREBASE_PRIVATE_KEY: optionalString(z.string().min(1)),
  GOOGLE_APPLICATION_CREDENTIALS: optionalString(z.string().min(1)),
  FIREBASE_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(14).default(7),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10)
}).superRefine((value, context) => {
  if (value.NODE_ENV === "test") return;
  const hasEmail = Boolean(value.FIREBASE_CLIENT_EMAIL);
  const hasPrivateKey = Boolean(value.FIREBASE_PRIVATE_KEY);
  if (hasEmail !== hasPrivateKey) {
    context.addIssue({ code: "custom", message: "Firebase service-account email and private key must be configured together.", path: ["FIREBASE_PRIVATE_KEY"] });
  }
  if (!hasEmail && !value.GOOGLE_APPLICATION_CREDENTIALS) {
    context.addIssue({ code: "custom", message: "Firebase Admin credentials are required.", path: ["FIREBASE_PRIVATE_KEY"] });
  }
  if (value.GOOGLE_APPLICATION_CREDENTIALS && !existsSync(value.GOOGLE_APPLICATION_CREDENTIALS)) {
    context.addIssue({ code: "custom", message: "The configured Google application credentials file does not exist.", path: ["GOOGLE_APPLICATION_CREDENTIALS"] });
  }
});

export const env = schema.parse(process.env);
