import { SessionModel, type SessionRecord } from "./session.model.js";

export async function createSessionRecord(input: { userId: string; tokenHash: string; expiresAt: Date; lastSeenAt: Date; userAgent?: string; ipHash?: string }): Promise<SessionRecord> {
  return new SessionModel(input).save();
}

export async function findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
  return SessionModel.findOne({ tokenHash, expiresAt: { $gt: new Date() } }).select("+tokenHash").exec();
}

export async function revokeSession(id: string): Promise<void> { await SessionModel.deleteOne({ _id: id }).exec(); }
export async function revokeSessionByTokenHash(tokenHash: string): Promise<void> { await SessionModel.deleteOne({ tokenHash }).exec(); }
export async function revokeAllUserSessions(userId: string): Promise<void> { await SessionModel.deleteMany({ userId }).exec(); }

export async function touchSessionIfStale(id: string, lastSeenAt: Date): Promise<void> {
  if (Date.now() - lastSeenAt.getTime() < 15 * 60_000) return;
  await SessionModel.updateOne({ _id: id, lastSeenAt: { $lt: new Date(Date.now() - 15 * 60_000) } }, { lastSeenAt: new Date() }).exec();
}
