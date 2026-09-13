import mongoose, { type Model, type Types } from "mongoose";
const { Schema, model, models } = mongoose;

export interface SessionRecord { _id: Types.ObjectId; userId: Types.ObjectId; tokenHash: string; createdAt: Date; expiresAt: Date; lastSeenAt: Date; userAgent?: string; ipHash?: string }

const sessionSchema = new Schema<SessionRecord>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  tokenHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true },
  lastSeenAt: { type: Date, required: true },
  userAgent: { type: String, maxlength: 300 },
  ipHash: { type: String, maxlength: 64 }
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

sessionSchema.index({ tokenHash: 1 }, { unique: true, name: "session_token_hash_unique" });
sessionSchema.index({ userId: 1 }, { name: "session_user" });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "session_expiry_ttl" });

export const SessionModel = (models.Session as Model<SessionRecord> | undefined) ?? model<SessionRecord>("Session", sessionSchema);
