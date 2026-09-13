import type { NextFunction, Request, Response } from "express";
import type { PlatformRole } from "@eduflux/shared-types";
import { ApiError } from "../../utils/api-error.js";
import { findActiveUserById } from "../users/user.repository.js";
import { findSessionByTokenHash, touchSessionIfStale } from "./session.repository.js";
import { hashSessionToken } from "./security.js";
import { readSessionToken } from "./session-cookie.js";

export async function requireAuth(request: Request, _response: Response, next: NextFunction): Promise<void> {
  try {
    const token = readSessionToken(request);
    if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Sign in to continue.");
    const session = await findSessionByTokenHash(hashSessionToken(token));
    if (!session) throw new ApiError(401, "AUTH_REQUIRED", "Sign in to continue.");
    const user = await findActiveUserById(session.userId.toString());
    if (!user) throw new ApiError(401, "AUTH_REQUIRED", "Sign in to continue.");
    request.principal = { userId: user._id.toString(), platformRole: user.platformRole, primaryPersona: user.primaryPersona, sessionId: session._id.toString() };
    void touchSessionIfStale(session._id.toString(), session.lastSeenAt).catch((error: unknown) => request.log.warn({ err: error }, "Session touch failed"));
    next();
  } catch (error) { next(error); }
}

export function requirePlatformRole(...roles: PlatformRole[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.principal || !roles.includes(request.principal.platformRole)) { next(new ApiError(403, "FORBIDDEN", "You do not have access to this resource.")); return; }
    next();
  };
}
