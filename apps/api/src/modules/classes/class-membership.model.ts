import mongoose, { type Model, type Types } from "mongoose";
const { Schema, model, models } = mongoose;

export interface MembershipRecord { _id: Types.ObjectId; classId: Types.ObjectId; userId: Types.ObjectId; role: "OWNER" | "TEACHER" | "STUDENT"; status: "ACTIVE" | "REMOVED"; joinedAt: Date; createdAt: Date; updatedAt: Date }

const membershipSchema = new Schema<MembershipRecord>({
  classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  role: { type: String, enum: ["OWNER", "TEACHER", "STUDENT"], required: true },
  status: { type: String, enum: ["ACTIVE", "REMOVED"], required: true, default: "ACTIVE" },
  joinedAt: { type: Date, required: true, default: Date.now }
}, { timestamps: true, versionKey: false });

membershipSchema.index({ classId: 1, userId: 1 }, { unique: true, name: "membership_class_user_unique" });
membershipSchema.index({ userId: 1, status: 1 }, { name: "membership_user_status" });
membershipSchema.index({ classId: 1, status: 1 }, { name: "membership_class_status" });
membershipSchema.index({ classId: 1, role: 1 }, { unique: true, partialFilterExpression: { role: "OWNER", status: "ACTIVE" }, name: "membership_one_active_owner" });

export const ClassMembershipModel = (models.ClassMembership as Model<MembershipRecord> | undefined) ?? model<MembershipRecord>("ClassMembership", membershipSchema);
