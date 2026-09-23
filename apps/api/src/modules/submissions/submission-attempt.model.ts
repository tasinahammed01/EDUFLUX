import mongoose, { type Model, type Types } from "mongoose";
const { Schema, model, models } = mongoose;
export interface SubmissionAttemptRecord {
  _id: Types.ObjectId;
  submissionId: Types.ObjectId;
  assignmentId: Types.ObjectId;
  classId: Types.ObjectId;
  studentUserId: Types.ObjectId;
  attemptNumber: number;
  typedText: string;
  fileIds: Types.ObjectId[];
  submittedAt: Date;
  isLate: boolean;
  rubricVersion?: number;
  rubricRevisionId?: Types.ObjectId;
  rubricRevisionNumber?: number;
  rubricHash?: string;
  createdAt: Date;
}
const schema = new Schema<SubmissionAttemptRecord>(
  {
    submissionId: {
      type: Schema.Types.ObjectId,
      ref: "Submission",
      required: true,
    },
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
    },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    studentUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    attemptNumber: { type: Number, required: true, min: 1 },
    typedText: { type: String, default: "", maxlength: 100_000 },
    fileIds: {
      type: [Schema.Types.ObjectId],
      ref: "SubmissionFile",
      default: [],
    },
    submittedAt: { type: Date, required: true },
    isLate: { type: Boolean, required: true },
    rubricVersion: Number,
    rubricRevisionId: { type: Schema.Types.ObjectId, ref: "RubricRevision" },
    rubricRevisionNumber: { type: Number, min: 1 },
    rubricHash: { type: String, minlength: 64, maxlength: 64 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    collection: "submission_attempts",
  },
);
schema.index(
  { submissionId: 1, attemptNumber: 1 },
  { unique: true, name: "attempt_submission_number_unique" },
);
schema.index(
  { assignmentId: 1, submittedAt: -1 },
  { name: "attempt_assignment_submitted" },
);
schema.index(
  { rubricRevisionId: 1, assignmentId: 1 },
  { sparse: true, name: "attempt_rubric_revision_assignment" },
);
schema.index(
  { assignmentId: 1, isLate: 1, submittedAt: -1 },
  { name: "attempt_assignment_late" },
);
schema.index(
  { studentUserId: 1, submittedAt: -1 },
  { name: "attempt_student_submitted" },
);
export const SubmissionAttemptModel =
  (models.SubmissionAttempt as Model<SubmissionAttemptRecord> | undefined) ??
  model<SubmissionAttemptRecord>("SubmissionAttempt", schema);
