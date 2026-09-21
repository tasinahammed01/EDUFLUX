import mongoose, { type Model, type Types } from "mongoose";
const { Schema, model, models } = mongoose;
export interface SubmissionRecord {
  _id: Types.ObjectId;
  assignmentId: Types.ObjectId;
  classId: Types.ObjectId;
  studentUserId: Types.ObjectId;
  status: "DRAFT" | "SUBMITTED";
  draftText: string;
  draftFileIds: Types.ObjectId[];
  draftRevision: number;
  latestAttemptNumber: number;
  latestSubmittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
const schema = new Schema<SubmissionRecord>(
  {
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
    },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    studentUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["DRAFT", "SUBMITTED"],
      default: "DRAFT",
      required: true,
    },
    draftText: { type: String, default: "", maxlength: 100_000 },
    draftFileIds: {
      type: [Schema.Types.ObjectId],
      ref: "SubmissionFile",
      default: [],
    },
    draftRevision: { type: Number, default: 0, required: true },
    latestAttemptNumber: { type: Number, default: 0, required: true },
    latestSubmittedAt: Date,
  },
  { timestamps: true, versionKey: false, collection: "submissions" },
);
schema.index(
  { assignmentId: 1, studentUserId: 1 },
  { unique: true, name: "submission_assignment_student_unique" },
);
schema.index(
  { assignmentId: 1, status: 1 },
  { name: "submission_assignment_status" },
);
schema.index({ classId: 1, status: 1 }, { name: "submission_class_status" });
schema.index(
  { studentUserId: 1, updatedAt: -1 },
  { name: "submission_student_updated" },
);
export const SubmissionModel =
  (models.Submission as Model<SubmissionRecord> | undefined) ??
  model<SubmissionRecord>("Submission", schema);
