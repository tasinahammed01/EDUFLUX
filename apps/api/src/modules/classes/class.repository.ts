import mongoose, {
  type ClientSession,
  type Types as MongooseTypes,
} from "mongoose";
const { Types } = mongoose;
import { ClassModel, type ClassRecord } from "./class.model.js";
import {
  ClassMembershipModel,
  type MembershipRecord,
} from "./class-membership.model.js";

export async function insertClass(
  input: {
    name: string;
    subjectLevel: string;
    startDate: string;
    endDate?: string;
    description?: string;
    joinCode: string;
    ownerUserId: string;
    inviteToken: string;
    allowJoinByCode: boolean;
    allowJoinByLink: boolean;
  },
  session: ClientSession,
): Promise<ClassRecord> {
  return new ClassModel({ ...input, status: "ACTIVE" }).save({ session });
}
export async function insertMembership(
  input: {
    classId: string;
    userId: string;
    role: "OWNER" | "TEACHER" | "STUDENT";
  },
  session?: ClientSession,
): Promise<MembershipRecord> {
  return new ClassMembershipModel({
    ...input,
    status: "ACTIVE",
    joinedAt: new Date(),
  }).save(session ? { session } : {});
}
export async function findActiveClassByCode(
  joinCode: string,
): Promise<ClassRecord | null> {
  return ClassModel.findOne({
    joinCode,
    status: "ACTIVE",
    allowJoinByCode: true,
  })
    .select("+inviteToken")
    .lean()
    .exec();
}
export async function findActiveClassByToken(inviteToken: string) {
  return ClassModel.findOne({
    inviteToken,
    status: "ACTIVE",
    allowJoinByLink: true,
  })
    .select("+inviteToken")
    .lean()
    .exec();
}
export async function findClassById(id: string): Promise<ClassRecord | null> {
  return ClassModel.findById(id).select("+inviteToken").lean().exec();
}
export async function findMembership(
  classId: string,
  userId: string,
): Promise<MembershipRecord | null> {
  return ClassMembershipModel.findOne({ classId, userId, status: "ACTIVE" })
    .lean()
    .exec();
}
export async function listMembershipsForUser(
  userId: string,
): Promise<MembershipRecord[]> {
  return ClassMembershipModel.find({ userId, status: "ACTIVE" })
    .sort({ joinedAt: -1 })
    .lean()
    .exec();
}
export async function findClassesByIds(ids: string[]): Promise<ClassRecord[]> {
  return ClassModel.find({ _id: { $in: ids } })
    .lean()
    .exec();
}
export async function countActiveMembersByClass(
  ids: string[],
): Promise<Map<string, number>> {
  const counts = await ClassMembershipModel.aggregate<{
    _id: MongooseTypes.ObjectId;
    count: number;
  }>([
    {
      $match: {
        classId: { $in: ids.map((id) => new Types.ObjectId(id)) },
        status: "ACTIVE",
      },
    },
    { $group: { _id: "$classId", count: { $sum: 1 } } },
  ]).exec();
  return new Map(counts.map((item) => [item._id.toString(), item.count]));
}
export async function countActiveMembers(classId: string): Promise<number> {
  return ClassMembershipModel.countDocuments({
    classId,
    status: "ACTIVE",
  }).exec();
}
export async function listMembers(
  classId: string,
  skip: number,
  limit: number,
  search = "",
) {
  const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return ClassMembershipModel.aggregate<{
    membershipId: { toString(): string };
    role: "OWNER" | "TEACHER" | "STUDENT";
    joinedAt: Date;
    displayName: string;
    email?: string;
    photoURL?: string;
  }>([
    { $match: { classId: new Types.ObjectId(classId), status: "ACTIVE" } },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
        pipeline: [{ $project: { displayName: 1, email: 1, photoURL: 1 } }],
      },
    },
    { $unwind: "$user" },
    ...(safeSearch
      ? [
          {
            $match: {
              $or: [
                { "user.displayName": { $regex: safeSearch, $options: "i" } },
                { "user.email": { $regex: safeSearch, $options: "i" } },
              ],
            },
          },
        ]
      : []),
    { $sort: { joinedAt: 1, _id: 1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $project: {
        userId: 1,
        role: 1,
        joinedAt: 1,
        displayName: "$user.displayName",
        email: "$user.email",
        photoURL: "$user.photoURL",
        membershipId: "$_id",
      },
    },
  ]).exec();
}
export async function countFilteredMembers(classId: string, search = "") {
  if (!search) return countActiveMembers(classId);
  const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const result = await ClassMembershipModel.aggregate<{ count: number }>([
    { $match: { classId: new Types.ObjectId(classId), status: "ACTIVE" } },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
        pipeline: [{ $project: { displayName: 1, email: 1 } }],
      },
    },
    { $unwind: "$user" },
    {
      $match: {
        $or: [
          { "user.displayName": { $regex: safeSearch, $options: "i" } },
          { "user.email": { $regex: safeSearch, $options: "i" } },
        ],
      },
    },
    { $count: "count" },
  ]).exec();
  return result[0]?.count ?? 0;
}
export function updateClass(classId: string, input: Record<string, unknown>) {
  return ClassModel.findByIdAndUpdate(
    classId,
    { $set: input },
    { returnDocument: "after", runValidators: true },
  )
    .select("+inviteToken")
    .lean()
    .exec();
}
export function removeMembership(classId: string, membershipId: string) {
  return ClassMembershipModel.findOneAndUpdate(
    { _id: membershipId, classId, role: "STUDENT", status: "ACTIVE" },
    { $set: { status: "REMOVED" } },
    { returnDocument: "after" },
  )
    .lean()
    .exec();
}
export function leaveMembership(classId: string, userId: string) {
  return ClassMembershipModel.findOneAndUpdate(
    { classId, userId, role: "STUDENT", status: "ACTIVE" },
    { $set: { status: "REMOVED" } },
    { returnDocument: "after" },
  )
    .lean()
    .exec();
}
