import { rateLimit } from "express-rate-limit";

const response = { data: null, error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." } };
export const authRateLimit = rateLimit({ windowMs: 15 * 60_000, limit: process.env.NODE_ENV === "test" ? 50 : 20, standardHeaders: "draft-8", legacyHeaders: false, message: response });
export const joinRateLimit = rateLimit({ windowMs: 15 * 60_000, limit: process.env.NODE_ENV === "test" ? 1000 : 30, standardHeaders: "draft-8", legacyHeaders: false, message: response });
