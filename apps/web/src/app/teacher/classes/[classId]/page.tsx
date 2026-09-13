import { ClassDetail } from "@/features/classes/class-detail";
export default async function TeacherClassPage({ params }: { params: Promise<{ classId: string }> }) { const { classId } = await params; return <ClassDetail id={classId} mode="teacher" />; }
