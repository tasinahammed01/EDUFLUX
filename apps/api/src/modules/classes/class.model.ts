import mongoose, { type Model, type Types } from "mongoose";
const { Schema, model, models } = mongoose;

export interface ClassRecord {
  _id: Types.ObjectId;
  name: string;
  subjectLevel?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  ownerUserId?: Types.ObjectId;
  joinCode: string;
  inviteToken?: string;
  allowJoinByCode: boolean;
  allowJoinByLink: boolean;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: Date;
  updatedAt: Date;
}

const classSchema = new Schema<ClassRecord>(
  {
    name: { type: String, required: true, minlength: 2, maxlength: 100 },
    subjectLevel: {
      type: String,
      enum: [
        "English",
        "English Language",
        "English Literature",
        "Academic Writing",
        "General",
        "Other",
      ],
    },
    startDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    endDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    description: { type: String, maxlength: 500 },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User" },
    joinCode: { type: String, required: true, minlength: 8, maxlength: 8 },
    inviteToken: { type: String, minlength: 32, maxlength: 128, select: false },
    allowJoinByCode: { type: Boolean, required: true, default: true },
    allowJoinByLink: { type: Boolean, required: true, default: true },
    status: {
      type: String,
      enum: ["ACTIVE", "ARCHIVED", "DELETED"],
      required: true,
      default: "ACTIVE",
    },
  },
  { timestamps: true, versionKey: false, collection: "classes" },
);

classSchema.index(
  { joinCode: 1 },
  { unique: true, name: "class_join_code_unique" },
);
classSchema.index(
  { inviteToken: 1 },
  { unique: true, sparse: true, name: "class_invite_token_unique" },
);
classSchema.index(
  { ownerUserId: 1, status: 1 },
  { name: "class_owner_status" },
);
export const ClassModel =
  (models.Class as Model<ClassRecord> | undefined) ??
  model<ClassRecord>("Class", classSchema);
