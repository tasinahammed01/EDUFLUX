import { AssignmentModel, type AssignmentRecord } from "./assignment.model.js";
export function insertAssignment(input: Record<string, unknown>) {
  return new AssignmentModel(input).save();
}
export function findAssignment(id: string) {
  return AssignmentModel.findById(id).lean().exec();
}
export function listAssignments(
  classId: string,
  student: boolean,
  page: number,
  limit: number,
) {
  const filter = student ? { classId, status: "PUBLISHED" as const } : { classId };
  return Promise.all([
    AssignmentModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .exec(),
    AssignmentModel.countDocuments(filter).exec(),
  ]);
}
export function updateAssignment(id: string, input: Record<string, unknown>) {
  return AssignmentModel.findByIdAndUpdate(
    id,
    { $set: input },
    { returnDocument: "after", runValidators: true },
  )
    .lean()
    .exec() as Promise<AssignmentRecord | null>;
}
