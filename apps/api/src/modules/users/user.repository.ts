import type { ClientSession } from "mongoose";
import { UserModel, type UserRecord } from "./user.model.js";

export function canonicalizeEmail(email: string): string { return email.trim().toLowerCase(); }

export async function findUserForAuthentication(emailCanonical: string): Promise<UserRecord | null> {
  return UserModel.findOne({ emailCanonical }).select("+emailCanonical +passwordHash +failedLoginCount +lockedUntil").exec();
}

export async function findActiveUserById(id: string): Promise<UserRecord | null> {
  return UserModel.findOne({ _id: id, status: "ACTIVE" }).exec();
}

export async function createUser(input: { email: string; emailCanonical: string; displayName: string; passwordHash: string; primaryPersona: "TEACHER" | "STUDENT" }, session?: ClientSession): Promise<UserRecord> {
  return new UserModel({ ...input, platformRole: "USER", status: "ACTIVE" }).save(session ? { session } : {});
}

export async function recordFailedLogin(userId: string, currentCount: number): Promise<void> {
  const nextCount = currentCount + 1;
  const lock = nextCount >= 10 ? { lockedUntil: new Date(Date.now() + 5 * 60_000), failedLoginCount: 0 } : { failedLoginCount: nextCount, $unset: { lockedUntil: 1 } };
  await UserModel.updateOne({ _id: userId }, lock).exec();
}

export async function recordSuccessfulLogin(userId: string): Promise<void> {
  await UserModel.updateOne({ _id: userId }, { failedLoginCount: 0, lastLoginAt: new Date(), $unset: { lockedUntil: 1 } }).exec();
}
