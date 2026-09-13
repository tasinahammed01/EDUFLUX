import "dotenv/config";
import { z } from "zod";
import { DEFAULT_API_PORT, DEFAULT_WEB_ORIGIN } from "@eduflux/config";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(DEFAULT_API_PORT),
  WEB_ORIGIN: z.url().default(DEFAULT_WEB_ORIGIN),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  MONGODB_URI: z.string().min(1).default(process.env.NODE_ENV === "test" ? "mongodb://127.0.0.1:27017/eduflux-test" : ""),
  SESSION_SECRET: z.string().min(32).default(process.env.NODE_ENV === "test" ? "test-session-secret-at-least-32-characters" : ""),
  CSRF_SECRET: z.string().min(32).default(process.env.NODE_ENV === "test" ? "test-csrf-secret-at-least-32-characters" : ""),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10)
});

export const env = schema.parse(process.env);
