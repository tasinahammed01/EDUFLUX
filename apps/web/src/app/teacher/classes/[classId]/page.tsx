import { TeacherClassWorkspace } from "@/features/classes/teacher-class-workspace";
export default async function TeacherClassPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  return <TeacherClassWorkspace id={classId} />;
}
