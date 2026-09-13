import { randomInt } from "node:crypto";
import mongoose from "mongoose";
import type { ClassSummary } from "@eduflux/shared-types";
import type { CreateClassInput, JoinClassInput } from "@eduflux/validation";
import { ApiError, isDuplicateKeyError } from "../../utils/api-error.js";
import { countActiveMembers, countActiveMembersByClass, findActiveClassByCode, findClassById, findClassesByIds, findMembership, insertClass, insertMembership, listMembershipsForUser } from "./class.repository.js";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateJoinCode(): string { return Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join(""); }

function mapSummary(record: { _id: { toString(): string }; name: string; description?: string | null; joinCode: string; createdAt: Date }, membership: { role: "OWNER" | "TEACHER" | "STUDENT"; joinedAt: Date }, memberCount?: number): ClassSummary {
  return { id: record._id.toString(), name: record.name, ...(record.description ? { description: record.description } : {}), ...(membership.role !== "STUDENT" ? { joinCode: record.joinCode } : {}), role: membership.role, joinedAt: membership.joinedAt.toISOString(), createdAt: record.createdAt.toISOString(), ...(memberCount !== undefined ? { memberCount } : {}) };
}

export async function createClass(input: CreateClassInput, userId: string, persona: string): Promise<ClassSummary> {
  if (persona !== "TEACHER") throw new ApiError(403, "FORBIDDEN", "Your current teaching profile is required to create a class.");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await mongoose.connection.transaction(async (session) => {
        const record = await insertClass({ name: input.name, ...(input.description ? { description: input.description } : {}), joinCode: generateJoinCode() }, session);
        const membership = await insertMembership({ classId: record._id.toString(), userId, role: "OWNER" }, session);
        return mapSummary(record, membership, 1);
      });
    } catch (error) { if (isDuplicateKeyError(error) && attempt < 4) continue; throw error; }
  }
  throw new ApiError(503, "CLASS_CODE_UNAVAILABLE", "Could not create a class right now.");
}

export async function joinClass(input: JoinClassInput, userId: string): Promise<ClassSummary> {
  const record = await findActiveClassByCode(input.joinCode);
  if (!record) throw new ApiError(404, "INVALID_JOIN_CODE", "That class code is not valid.");
  try {
    const membership = await insertMembership({ classId: record._id.toString(), userId, role: "STUDENT" });
    return mapSummary(record, membership);
  } catch (error) { if (isDuplicateKeyError(error)) throw new ApiError(409, "CLASS_ALREADY_JOINED", "You already belong to this class."); throw error; }
}

export async function listMyClasses(userId: string): Promise<ClassSummary[]> {
  const memberships = await listMembershipsForUser(userId);
  const ids = memberships.map((membership) => membership.classId.toString());
  const [records, counts] = await Promise.all([findClassesByIds(ids), countActiveMembersByClass(ids)]);
  const recordsById = new Map(records.map((record) => [record._id.toString(), record]));
  const items = memberships.map((membership) => {
    const id = membership.classId.toString(); const record = recordsById.get(id);
    return record ? mapSummary(record, membership, membership.role === "STUDENT" ? undefined : counts.get(id) ?? 0) : null;
  });
  return items.filter((item): item is ClassSummary => item !== null);
}

export async function getClassForMember(classId: string, userId: string): Promise<ClassSummary> {
  const [record, membership] = await Promise.all([findClassById(classId), findMembership(classId, userId)]);
  if (!record || !membership) throw new ApiError(404, "CLASS_NOT_FOUND", "Class not found.");
  return mapSummary(record, membership, membership.role === "STUDENT" ? undefined : await countActiveMembers(classId));
}
