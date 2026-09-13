import mongoose from "mongoose";
import type { NextFunction, Request, Response } from "express";
import type { ClassMembershipRole } from "@eduflux/shared-types";
import { ApiError } from "../../utils/api-error.js";
import { findMembership } from "./class.repository.js";

export async function requireClassMembership(request: Request, _response: Response, next: NextFunction): Promise<void> {
  try {
    const rawClassId = request.params.classId;
    const classId = Array.isArray(rawClassId) ? rawClassId[0] : rawClassId;
    if (!classId || !mongoose.isObjectIdOrHexString(classId)) throw new ApiError(400, "VALIDATION_ERROR", "Invalid class identifier.");
    const membership = await findMembership(classId, request.principal!.userId);
    if (!membership) throw new ApiError(404, "CLASS_NOT_FOUND", "Class not found.");
    request.classMembership = { id: membership._id.toString(), classId, userId: membership.userId.toString(), role: membership.role };
    next();
  } catch (error) { next(error); }
}

export function requireClassRole(...roles: ClassMembershipRole[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.classMembership || !roles.includes(request.classMembership.role)) { next(new ApiError(403, "FORBIDDEN", "You do not have access to this resource.")); return; }
    next();
  };
}
