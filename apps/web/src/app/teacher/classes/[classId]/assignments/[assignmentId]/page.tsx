import { AssignmentDetail } from "@/features/classes/assignment-detail";
export default async function Page({
  params,
}: {
  params: Promise<{ classId: string; assignmentId: string }>;
}) {
  const value = await params;
  return <AssignmentDetail {...value} mode="teacher" />;
}
