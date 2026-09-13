import mongoose, { type ClientSession, type Types as MongooseTypes } from "mongoose";
const { Types } = mongoose;
import { ClassModel, type ClassRecord } from "./class.model.js";
import { ClassMembershipModel, type MembershipRecord } from "./class-membership.model.js";

export async function insertClass(input: { name: string; description?: string; joinCode: string }, session: ClientSession): Promise<ClassRecord> {
  return new ClassModel({ ...input, status: "ACTIVE" }).save({ session });
}
export async function insertMembership(input: { classId: string; userId: string; role: "OWNER" | "TEACHER" | "STUDENT" }, session?: ClientSession): Promise<MembershipRecord> {
  return new ClassMembershipModel({ ...input, status: "ACTIVE", joinedAt: new Date() }).save(session ? { session } : {});
}
export async function findActiveClassByCode(joinCode: string): Promise<ClassRecord | null> { return ClassModel.findOne({ joinCode, status: "ACTIVE" }).lean().exec(); }
export async function findClassById(id: string): Promise<ClassRecord | null> { return ClassModel.findOne({ _id: id, status: "ACTIVE" }).lean().exec(); }
export async function findMembership(classId: string, userId: string): Promise<MembershipRecord | null> { return ClassMembershipModel.findOne({ classId, userId, status: "ACTIVE" }).lean().exec(); }
export async function listMembershipsForUser(userId: string): Promise<MembershipRecord[]> { return ClassMembershipModel.find({ userId, status: "ACTIVE" }).sort({ joinedAt: -1 }).lean().exec(); }
export async function findClassesByIds(ids: string[]): Promise<ClassRecord[]> { return ClassModel.find({ _id: { $in: ids }, status: "ACTIVE" }).lean().exec(); }
export async function countActiveMembersByClass(ids: string[]): Promise<Map<string, number>> {
  const counts = await ClassMembershipModel.aggregate<{ _id: MongooseTypes.ObjectId; count: number }>([{ $match: { classId: { $in: ids.map((id) => new Types.ObjectId(id)) }, status: "ACTIVE" } }, { $group: { _id: "$classId", count: { $sum: 1 } } }]).exec();
  return new Map(counts.map((item) => [item._id.toString(), item.count]));
}
export async function countActiveMembers(classId: string): Promise<number> { return ClassMembershipModel.countDocuments({ classId, status: "ACTIVE" }).exec(); }
export async function listMembers(classId: string, skip: number, limit: number) {
  return ClassMembershipModel.aggregate<{ userId: { toString(): string }; role: "OWNER" | "TEACHER" | "STUDENT"; joinedAt: Date; displayName: string }>([
    { $match: { classId: new Types.ObjectId(classId), status: "ACTIVE" } },
    { $sort: { joinedAt: 1, _id: 1 } }, { $skip: skip }, { $limit: limit },
    { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user", pipeline: [{ $project: { displayName: 1 } }] } },
    { $unwind: "$user" }, { $project: { userId: 1, role: 1, joinedAt: 1, displayName: "$user.displayName" } }
  ]).exec();
}
