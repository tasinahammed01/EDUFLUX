import mongoose, { type Model, type Types } from "mongoose";
const { Schema, model, models } = mongoose;
export interface SubmissionFileRecord {
  _id: Types.ObjectId;
  ownerUserId: Types.ObjectId;
  classId: Types.ObjectId;
  assignmentId: Types.ObjectId;
  submissionId: Types.ObjectId;
  objectKey: string;
  originalName: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  status: "PENDING" | "READY" | "DELETED" | "REJECTED";
  expiresAt?: Date;
  finalizedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
const schema = new Schema<SubmissionFileRecord>(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
    },
    submissionId: {
      type: Schema.Types.ObjectId,
      ref: "Submission",
      required: true,
    },
    objectKey: { type: String, required: true, select: false },
    originalName: { type: String, required: true, maxlength: 200 },
    mimeType: {
      type: String,
      enum: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
      required: true,
    },
    sizeBytes: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ["PENDING", "READY", "DELETED", "REJECTED"],
      required: true,
      default: "PENDING",
    },
    expiresAt: Date,
    finalizedAt: Date,
  },
  { timestamps: true, versionKey: false, collection: "submission_files" },
);
schema.index({ ownerUserId: 1, createdAt: -1 }, { name: "file_owner_created" });
schema.index(
  { submissionId: 1, status: 1 },
  { name: "file_submission_status" },
);
schema.index(
  { assignmentId: 1, status: 1 },
  { name: "file_assignment_status" },
);
schema.index({ status: 1, expiresAt: 1 }, { name: "file_pending_expiry" });
export const SubmissionFileModel =
  (models.SubmissionFile as Model<SubmissionFileRecord> | undefined) ??
  model<SubmissionFileRecord>("SubmissionFile", schema);
