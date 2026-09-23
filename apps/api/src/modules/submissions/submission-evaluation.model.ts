import mongoose, { type Model, type Types } from "mongoose";

const { Schema, model, models } = mongoose;

export interface SubmissionEvaluationRecord {
  _id: Types.ObjectId;
  submissionId: Types.ObjectId;
  attemptId: Types.ObjectId;
  assignmentId: Types.ObjectId;
  classId: Types.ObjectId;
  studentUserId: Types.ObjectId;
  rubricRevisionId?: Types.ObjectId;
  rubricRevisionNumber?: number;
  sourceFileIds: Types.ObjectId[];
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  statusMessage?: string;
  failureStage?: "OCR" | "AI_EVALUATION" | "VALIDATION" | "PERSISTENCE";
  failureCode?: string;
  transcribedText: string;
  effectiveText: string;
  ocrMetadata?: { provider: string; model: string; processedFiles: number; completedAt?: Date };
  issues: Array<Record<string, unknown>>;
  overallScore?: number;
  maxScore?: number;
  correctionStats: Record<string, number>;
  legendSummary: Array<Record<string, unknown>>;
  strengths: Array<Record<string, unknown>>;
  feedbackSections: Array<Record<string, unknown>>;
  teacherComment?: string;
  evaluationMetadata?: { provider: string; model: string; tokensUsed?: number };
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<SubmissionEvaluationRecord>({
  submissionId: { type: Schema.Types.ObjectId, ref: "Submission", required: true, immutable: true },
  attemptId: { type: Schema.Types.ObjectId, ref: "SubmissionAttempt", required: true, immutable: true },
  assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", required: true, immutable: true },
  classId: { type: Schema.Types.ObjectId, ref: "Class", required: true, immutable: true },
  studentUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  rubricRevisionId: { type: Schema.Types.ObjectId, ref: "RubricRevision", immutable: true },
  rubricRevisionNumber: { type: Number, min: 1, immutable: true },
  sourceFileIds: { type: [Schema.Types.ObjectId], ref: "SubmissionFile", default: [], immutable: true },
  status: { type: String, enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"], required: true, default: "PENDING" },
  statusMessage: { type: String, maxlength: 500 },
  failureStage: { type: String, enum: ["OCR", "AI_EVALUATION", "VALIDATION", "PERSISTENCE"] },
  failureCode: { type: String, maxlength: 100 },
  transcribedText: { type: String, default: "", maxlength: 500_000 },
  effectiveText: { type: String, default: "", maxlength: 600_000 },
  ocrMetadata: { provider: String, model: String, processedFiles: Number, completedAt: Date },
  issues: { type: [Schema.Types.Mixed] as never, default: [] },
  overallScore: { type: Number, min: 0 },
  maxScore: { type: Number, min: 0 },
  correctionStats: { type: Map, of: Number, default: {} },
  legendSummary: { type: [Schema.Types.Mixed] as never, default: [] },
  strengths: { type: [Schema.Types.Mixed] as never, default: [] },
  feedbackSections: { type: [Schema.Types.Mixed] as never, default: [] },
  teacherComment: { type: String, maxlength: 5000 },
  evaluationMetadata: { provider: String, model: String, tokensUsed: Number },
  completedAt: Date,
}, { timestamps: true, versionKey: false, collection: "submission_evaluations" });

schema.index({ attemptId: 1 }, { unique: true, name: "evaluation_attempt_unique" });
schema.index({ assignmentId: 1, studentUserId: 1, createdAt: -1 }, { name: "evaluation_assignment_student" });
schema.index({ status: 1, updatedAt: 1 }, { name: "evaluation_status_updated" });

export const SubmissionEvaluationModel =
  (models.SubmissionEvaluation as Model<SubmissionEvaluationRecord> | undefined) ??
  model<SubmissionEvaluationRecord>("SubmissionEvaluation", schema);
