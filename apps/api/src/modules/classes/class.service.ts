import { randomBytes, randomInt } from "node:crypto";
import mongoose from "mongoose";
import type { ClassSummary } from "@eduflux/shared-types";
import type {
  CreateClassInput,
  JoinClassInput,
  UpdateClassInput,
} from "@eduflux/validation";
import { UserModel } from "../users/user.model.js";
import { env } from "../../config/env.js";
import { ApiError, isDuplicateKeyError } from "../../utils/api-error.js";
import {
  countActiveMembers,
  countActiveMembersByClass,
  findActiveClassByCode,
  findActiveClassByToken,
  findClassById,
  findClassesByIds,
  findMembership,
  insertClass,
  insertMembership,
  listMembershipsForUser,
  leaveMembership,
  removeMembership,
  updateClass,
} from "./class.repository.js";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateJoinCode(): string {
  return Array.from(
    { length: 8 },
    () => alphabet[randomInt(alphabet.length)],
  ).join("");
}
export function generateInviteToken() {
  return randomBytes(32).toString("base64url");
}

function mapSummary(
  record: {
    _id: { toString(): string };
    name: string;
    subjectLevel?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    description?: string | null;
    joinCode: string;
    inviteToken?: string | null;
    status: "ACTIVE" | "ARCHIVED";
    allowJoinByCode?: boolean;
    allowJoinByLink?: boolean;
    createdAt: Date;
  },
  membership: { role: "OWNER" | "TEACHER" | "STUDENT"; joinedAt: Date },
  memberCount?: number,
): ClassSummary {
  return {
    id: record._id.toString(),
    name: record.name,
    ...(record.subjectLevel ? { subjectLevel: record.subjectLevel } : {}),
    ...(record.startDate ? { startDate: record.startDate } : {}),
    ...(record.endDate ? { endDate: record.endDate } : {}),
    ...(record.description ? { description: record.description } : {}),
    ...(membership.role !== "STUDENT" ? { joinCode: record.joinCode } : {}),
    ...(membership.role !== "STUDENT" && record.inviteToken
      ? {
          inviteToken: record.inviteToken,
          joinUrl: `${env.WEB_ORIGIN}/join/${record.inviteToken}`,
        }
      : {}),
    status: record.status,
    allowJoinByCode: record.allowJoinByCode ?? true,
    allowJoinByLink: record.allowJoinByLink ?? true,
    role: membership.role,
    joinedAt: membership.joinedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    ...(memberCount !== undefined ? { memberCount } : {}),
  };
}

export async function createClass(
  input: CreateClassInput,
  userId: string,
  persona?: string,
): Promise<ClassSummary> {
  if (persona !== "TEACHER")
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Your current teaching profile is required to create a class.",
    );
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await mongoose.connection.transaction(async (session) => {
        const record = await insertClass(
          {
            name: input.name,
            subjectLevel: input.subjectLevel,
            startDate: input.startDate,
            ...(input.endDate ? { endDate: input.endDate } : {}),
            ...(input.description ? { description: input.description } : {}),
            joinCode: generateJoinCode(),
            ownerUserId: userId,
            inviteToken: generateInviteToken(),
            allowJoinByCode: input.allowJoinByCode,
            allowJoinByLink: input.allowJoinByLink,
          },
          session,
        );
        const membership = await insertMembership(
          { classId: record._id.toString(), userId, role: "OWNER" },
          session,
        );
        return mapSummary(record, membership, 1);
      });
    } catch (error) {
      if (isDuplicateKeyError(error) && attempt < 4) continue;
      throw error;
    }
  }
  throw new ApiError(
    503,
    "CLASS_CODE_UNAVAILABLE",
    "Could not create a class right now.",
  );
}

export async function joinClass(
  input: JoinClassInput,
  userId: string,
): Promise<ClassSummary> {
  const record = await findActiveClassByCode(input.joinCode);
  if (!record)
    throw new ApiError(
      404,
      "INVALID_JOIN_CODE",
      "That class code is not valid.",
    );
  try {
    const membership = await insertMembership({
      classId: record._id.toString(),
      userId,
      role: "STUDENT",
    });
    return mapSummary(record, membership);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const membership = await findMembership(record._id.toString(), userId);
      if (membership) return mapSummary(record, membership);
    }
    throw error;
  }
}
export async function previewInvite(token: string) {
  const record = await findActiveClassByToken(token);
  if (!record)
    throw new ApiError(
      404,
      "INVALID_INVITE",
      "This invitation is invalid or no longer active.",
    );
  const owner = record.ownerUserId
    ? await UserModel.findById(record.ownerUserId)
        .select("displayName photoURL")
        .lean()
        .exec()
    : null;
  return {
    name: record.name,
    ...(record.subjectLevel ? { subjectLevel: record.subjectLevel } : {}),
    ...(record.startDate ? { startDate: record.startDate } : {}),
    ...(record.endDate ? { endDate: record.endDate } : {}),
    status: record.status,
    teacher: {
      displayName: owner?.displayName ?? "EduFlux teacher",
      ...(owner?.photoURL ? { photoURL: owner.photoURL } : {}),
      role: "OWNER" as const,
    },
  };
}
export async function joinByInvite(token: string, userId: string) {
  const record = await findActiveClassByToken(token);
  if (!record)
    throw new ApiError(
      404,
      "INVALID_INVITE",
      "This invitation is invalid or no longer active.",
    );
  const existing = await findMembership(record._id.toString(), userId);
  if (existing) return mapSummary(record, existing);
  try {
    return mapSummary(
      record,
      await insertMembership({
        classId: record._id.toString(),
        userId,
        role: "STUDENT",
      }),
    );
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const membership = await findMembership(record._id.toString(), userId);
      if (membership) return mapSummary(record, membership);
    }
    throw error;
  }
}
export async function rotateInvite(classId: string) {
  const record = await updateClass(classId, {
    inviteToken: generateInviteToken(),
    allowJoinByLink: true,
  });
  if (!record) throw new ApiError(404, "CLASS_NOT_FOUND", "Class not found.");
  return {
    inviteToken: record.inviteToken!,
    joinUrl: `${env.WEB_ORIGIN}/join/${record.inviteToken}`,
  };
}
export async function editClass(classId: string, input: UpdateClassInput) {
  const current = await findClassById(classId);
  if (!current) throw new ApiError(404, "CLASS_NOT_FOUND", "Class not found.");
  const start = input.startDate ?? current.startDate,
    end = input.endDate ?? current.endDate;
  if (start && end && end < start)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Please check the submitted fields.",
      { endDate: ["End date cannot be earlier than start date."] },
    );
  const record = await updateClass(classId, input);
  if (!record) throw new ApiError(404, "CLASS_NOT_FOUND", "Class not found.");
  return {
    id: record._id.toString(),
    name: record.name,
    ...(record.subjectLevel ? { subjectLevel: record.subjectLevel } : {}),
    ...(record.startDate ? { startDate: record.startDate } : {}),
    ...(record.endDate ? { endDate: record.endDate } : {}),
    ...(record.description ? { description: record.description } : {}),
    status: record.status,
  };
}
export async function archiveClass(classId: string) {
  const record = await updateClass(classId, {
    status: "ARCHIVED",
    allowJoinByCode: false,
    allowJoinByLink: false,
  });
  if (!record) throw new ApiError(404, "CLASS_NOT_FOUND", "Class not found.");
  return { status: record.status };
}
export async function leaveClass(classId: string, userId: string) {
  if (!(await leaveMembership(classId, userId)))
    throw new ApiError(
      403,
      "OWNER_CANNOT_LEAVE",
      "Owners and teachers cannot leave this class.",
    );
  return { left: true };
}
export async function removeStudent(classId: string, membershipId: string) {
  if (!(await removeMembership(classId, membershipId)))
    throw new ApiError(
      404,
      "MEMBER_NOT_FOUND",
      "Student membership not found.",
    );
  return { removed: true };
}

export async function listMyClasses(userId: string): Promise<ClassSummary[]> {
  const memberships = await listMembershipsForUser(userId);
  const ids = memberships.map((membership) => membership.classId.toString());
  const [records, counts] = await Promise.all([
    findClassesByIds(ids),
    countActiveMembersByClass(ids),
  ]);
  const recordsById = new Map(
    records.map((record) => [record._id.toString(), record]),
  );
  const items = memberships.map((membership) => {
    const id = membership.classId.toString();
    const record = recordsById.get(id);
    return record
      ? mapSummary(
          record,
          membership,
          membership.role === "STUDENT" ? undefined : (counts.get(id) ?? 0),
        )
      : null;
  });
  return items.filter((item): item is ClassSummary => item !== null);
}

export async function getClassForMember(
  classId: string,
  userId: string,
): Promise<ClassSummary> {
  const [record, membership] = await Promise.all([
    findClassById(classId),
    findMembership(classId, userId),
  ]);
  if (!record || !membership)
    throw new ApiError(404, "CLASS_NOT_FOUND", "Class not found.");
  const summary = mapSummary(
    record,
    membership,
    membership.role === "STUDENT"
      ? undefined
      : await countActiveMembers(classId),
  );
  const owner = record.ownerUserId
    ? await UserModel.findById(record.ownerUserId)
        .select(
          `displayName photoURL ${membership.role === "STUDENT" ? "" : "email"}`,
        )
        .lean()
        .exec()
    : null;
  return {
    ...summary,
    owner: {
      displayName: owner?.displayName ?? "EduFlux teacher",
      ...(owner?.photoURL ? { photoURL: owner.photoURL } : {}),
      ...(owner?.email ? { email: owner.email } : {}),
      role: "OWNER",
    },
  };
}
