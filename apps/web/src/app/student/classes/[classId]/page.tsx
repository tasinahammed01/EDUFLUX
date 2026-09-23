import { StudentClassWorkspace } from "@/features/classes/student-class-workspace";
export default async function StudentClassPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  return <StudentClassWorkspace id={classId} />;
}
