import mongoose, { type Model, type Types } from "mongoose";
const { Schema, model, models } = mongoose;

export interface UserRecord {
  _id: Types.ObjectId; email: string; emailCanonical: string; displayName: string; passwordHash: string;
  primaryPersona: "TEACHER" | "STUDENT"; platformRole: "USER" | "ADMIN" | "SUPER_ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "DISABLED"; failedLoginCount: number; lockedUntil?: Date;
  lastLoginAt?: Date; emailVerifiedAt?: Date; createdAt: Date; updatedAt: Date;
}

const userSchema = new Schema<UserRecord>({
  email: { type: String, required: true, maxlength: 254 },
  emailCanonical: { type: String, required: true, maxlength: 254, select: false },
  displayName: { type: String, required: true, minlength: 2, maxlength: 80 },
  passwordHash: { type: String, required: true, select: false },
  primaryPersona: { type: String, enum: ["TEACHER", "STUDENT"], required: true },
  platformRole: { type: String, enum: ["USER", "ADMIN", "SUPER_ADMIN"], required: true, default: "USER" },
  status: { type: String, enum: ["ACTIVE", "SUSPENDED", "DISABLED"], required: true, default: "ACTIVE" },
  failedLoginCount: { type: Number, required: true, default: 0, select: false },
  lockedUntil: { type: Date, select: false },
  lastLoginAt: Date,
  emailVerifiedAt: Date
}, { timestamps: true, versionKey: false });

userSchema.index({ emailCanonical: 1 }, { unique: true, name: "user_email_canonical_unique" });
userSchema.set("toJSON", { transform: (_document, value: Partial<UserRecord>) => { delete value.passwordHash; delete value.emailCanonical; delete value.failedLoginCount; delete value.lockedUntil; return value; } });

export const UserModel = (models.User as Model<UserRecord> | undefined) ?? model<UserRecord>("User", userSchema);
