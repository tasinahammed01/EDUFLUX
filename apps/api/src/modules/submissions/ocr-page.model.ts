import mongoose, { type Model, type Types } from "mongoose";
import type { OcrWord } from "./ocr.service.js";
const { Schema, model, models } = mongoose;
export interface OcrPageRecord { evaluationId: Types.ObjectId; attemptId: Types.ObjectId; sourceFileId: Types.ObjectId; pageNumber: number; width: number; height: number; words: OcrWord[]; createdAt: Date; updatedAt: Date }
const schema = new Schema<OcrPageRecord>({ evaluationId: { type: Schema.Types.ObjectId, ref: "SubmissionEvaluation", required: true, immutable: true }, attemptId: { type: Schema.Types.ObjectId, ref: "SubmissionAttempt", required: true, immutable: true }, sourceFileId: { type: Schema.Types.ObjectId, ref: "SubmissionFile", required: true, immutable: true }, pageNumber: { type: Number, required: true, min: 1, immutable: true }, width: { type: Number, required: true, min: 1 }, height: { type: Number, required: true, min: 1 }, words: { type: [Schema.Types.Mixed] as never, default: [] } }, { timestamps: true, versionKey: false, collection: "submission_ocr_pages" });
schema.index({ evaluationId: 1, sourceFileId: 1, pageNumber: 1 }, { unique: true, name: "ocr_page_unique" });
export const OcrPageModel = (models.SubmissionOcrPage as Model<OcrPageRecord> | undefined) ?? model<OcrPageRecord>("SubmissionOcrPage", schema);
