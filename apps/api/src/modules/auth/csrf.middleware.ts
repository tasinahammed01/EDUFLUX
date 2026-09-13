import type { NextFunction, Request, Response } from "express";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/api-error.js";
import { createCsrfToken, verifyCsrfToken } from "./security.js";
import { CSRF_COOKIE_NAME, csrfCookieOptions } from "./session-cookie.js";

export function issueCsrfToken(_request: Request, response: Response): void {
  const token = createCsrfToken();
  response.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions);
  response.json({ data: { csrfToken: token }, error: null });
}

export function requireCsrf(request: Request, _response: Response, next: NextFunction): void {
  const origin = request.get("origin");
  if (origin && origin !== env.WEB_ORIGIN) { next(new ApiError(403, "ORIGIN_INVALID", "Request origin is not allowed.")); return; }
  const header = request.get("x-csrf-token");
  const cookie = request.cookies[CSRF_COOKIE_NAME] as string | undefined;
  if (!header || !cookie || header !== cookie || !verifyCsrfToken(header)) { next(new ApiError(403, "CSRF_INVALID", "Security token is missing or invalid.")); return; }
  next();
}
