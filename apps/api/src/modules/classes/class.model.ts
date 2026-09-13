import mongoose, { type Model, type Types } from "mongoose";
const { Schema, model, models } = mongoose;

export interface ClassRecord { _id: Types.ObjectId; name: string; description?: string; joinCode: string; status: "ACTIVE" | "ARCHIVED"; createdAt: Date; updatedAt: Date }

const classSchema = new Schema<ClassRecord>({
  name: { type: String, required: true, minlength: 2, maxlength: 100 },
  description: { type: String, maxlength: 500 },
  joinCode: { type: String, required: true, minlength: 8, maxlength: 8 },
  status: { type: String, enum: ["ACTIVE", "ARCHIVED"], required: true, default: "ACTIVE" }
}, { timestamps: true, versionKey: false, collection: "classes" });

classSchema.index({ joinCode: 1 }, { unique: true, name: "class_join_code_unique" });
export const ClassModel = (models.Class as Model<ClassRecord> | undefined) ?? model<ClassRecord>("Class", classSchema);
