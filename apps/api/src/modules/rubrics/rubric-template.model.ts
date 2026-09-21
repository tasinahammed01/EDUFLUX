import mongoose, { type Model, type Types } from "mongoose";
const { Schema, model, models } = mongoose;
export interface RubricTemplateRecord {
  _id: Types.ObjectId;
  ownerUserId: Types.ObjectId;
  name: string;
  description?: string;
  rubric: Record<string, unknown>;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
const schema = new Schema<RubricTemplateRecord>(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, maxlength: 120 },
    description: { type: String, maxlength: 1000 },
    rubric: { type: Schema.Types.Mixed, required: true },
    archivedAt: Date,
  },
  { timestamps: true, versionKey: false, collection: "rubric_templates" },
);
schema.index(
  { ownerUserId: 1, updatedAt: -1 },
  { name: "rubric_template_owner_updated" },
);
export const RubricTemplateModel =
  (models.RubricTemplate as Model<RubricTemplateRecord> | undefined) ??
  model<RubricTemplateRecord>("RubricTemplate", schema);
