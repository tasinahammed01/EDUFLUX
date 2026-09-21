import mongoose, { type Model, type Types } from "mongoose";
const { Schema, model, models } = mongoose;
export interface AssignmentRecord {
  _id: Types.ObjectId;
  classId: Types.ObjectId;
  createdByUserId: Types.ObjectId;
  title: string;
  description?: string;
  instructions?: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  availableFrom?: Date;
  dueAt?: Date;
  maxScore: number;
  allowLateSubmission: boolean;
  allowResubmission: boolean;
  maxAttempts?: number;
  showMarks: boolean;
  rubric?: { version:number; title:string; description?:string; criteria:Array<{id:string;title:string;description?:string;maxPoints:number;performanceLevels:Array<{id:string;label:string;description?:string;points:number}>}> };
  resourceLinks: Array<{ label: string; url: string }>;
  publishedAt?: Date;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
const schema = new Schema<AssignmentRecord>(
  {
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true, minlength: 2, maxlength: 150 },
    description: { type: String, maxlength: 500 },
    instructions: { type: String, maxlength: 10_000 },
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      required: true,
      default: "DRAFT",
    },
    availableFrom: Date,
    dueAt: Date,
    maxScore: {
      type: Number,
      required: true,
      min: 0.01,
      max: 10_000,
      default: 100,
    },
    allowLateSubmission: { type: Boolean, required: true, default: false },
    allowResubmission: { type: Boolean, required: true, default: false },
    maxAttempts: { type: Number, min: 1, max: 10 },
    showMarks: { type: Boolean, required: true, default: true },
    rubric: { type: new Schema({ version:{type:Number,required:true,default:1}, title:{type:String,required:true,maxlength:120}, description:{type:String,maxlength:1000}, criteria:{type:[new Schema({ id:{type:String,required:true}, title:{type:String,required:true,maxlength:120}, description:{type:String,maxlength:1000}, maxPoints:{type:Number,required:true,min:0}, performanceLevels:{type:[new Schema({id:{type:String,required:true},label:{type:String,required:true},description:{type:String,maxlength:500},points:{type:Number,required:true,min:0}},{_id:false})],default:[]}},{_id:false})],required:true} },{_id:false}), required:false },
    resourceLinks: {
      type: [
        {
          label: { type: String, required: true, maxlength: 100 },
          url: { type: String, required: true, maxlength: 2048 },
          _id: false,
        },
      ],
      default: [],
    },
    publishedAt: Date,
    archivedAt: Date,
  },
  { timestamps: true, versionKey: false, collection: "assignments" },
);
schema.index(
  { classId: 1, status: 1, createdAt: -1 },
  { name: "assignment_class_status_created" },
);
schema.index({ classId: 1, dueAt: 1 }, { name: "assignment_class_due" });
schema.index(
  { createdByUserId: 1, createdAt: -1 },
  { name: "assignment_creator_created" },
);
export const AssignmentModel =
  (models.Assignment as Model<AssignmentRecord> | undefined) ??
  model<AssignmentRecord>("Assignment", schema);
