import mongoose, { type Model, type Types } from "mongoose";

const { Schema, model, models } = mongoose;

export interface RubricRevisionRecord {
  _id: Types.ObjectId;
  assignmentId: Types.ObjectId;
  classId: Types.ObjectId;
  revisionNumber: number;
  rubric: {
    version: number;
    title: string;
    description: string;
    levels: Array<{
      id: string;
      label: string;
      description: string;
      percentage: number;
    }>;
    criteria: Array<{
      id: string;
      title: string;
      description: string;
      weight: number;
      descriptors: string[];
    }>;
  };
  rubricHash: string;
  maxScore: number;
  createdByUserId: Types.ObjectId;
  supersedesRevisionId?: Types.ObjectId;
  changeSummary?: string;
  createdAt: Date;
}

const levelSchema = new Schema(
  {
    id: { type: String, required: true, immutable: true },
    label: { type: String, required: true, maxlength: 80, immutable: true },
    description: { type: String, maxlength: 500, immutable: true },
    percentage: { type: Number, required: true, min: 0, max: 100, immutable: true },
  },
  { _id: false },
);

const criterionSchema = new Schema(
  {
    id: { type: String, required: true, immutable: true },
    title: { type: String, required: true, maxlength: 120, immutable: true },
    description: { type: String, maxlength: 1000, immutable: true },
    weight: { type: Number, required: true, min: 1, max: 100, immutable: true },
    descriptors: { type: [String], required: true, immutable: true },
  },
  { _id: false },
);

const schema = new Schema<RubricRevisionRecord>(
  {
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", required: true, immutable: true },
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true, immutable: true },
    revisionNumber: { type: Number, required: true, min: 1, immutable: true },
    rubric: {
      type: new Schema(
        {
          version: { type: Number, required: true, immutable: true },
          title: { type: String, required: true, maxlength: 120, immutable: true },
          description: { type: String, maxlength: 1000, immutable: true },
          levels: { type: [levelSchema], required: true, immutable: true },
          criteria: { type: [criterionSchema], required: true, immutable: true },
        },
        { _id: false },
      ),
      required: true,
      immutable: true,
    },
    rubricHash: { type: String, required: true, minlength: 64, maxlength: 64, immutable: true },
    maxScore: { type: Number, required: true, min: 0.01, max: 10_000, immutable: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    supersedesRevisionId: { type: Schema.Types.ObjectId, ref: "RubricRevision", immutable: true },
    changeSummary: { type: String, maxlength: 500, immutable: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    collection: "rubric_revisions",
  },
);

schema.index(
  { assignmentId: 1, revisionNumber: 1 },
  { unique: true, name: "rubric_revision_assignment_number_unique" },
);
schema.index(
  { assignmentId: 1, rubricHash: 1 },
  { unique: true, name: "rubric_revision_assignment_hash_unique" },
);
schema.index(
  { classId: 1, assignmentId: 1, revisionNumber: -1 },
  { name: "rubric_revision_class_assignment_number" },
);

export const RubricRevisionModel =
  (models.RubricRevision as Model<RubricRevisionRecord> | undefined) ??
  model<RubricRevisionRecord>("RubricRevision", schema);
