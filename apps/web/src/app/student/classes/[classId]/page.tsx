import { ClassDetail } from "@/features/classes/class-detail";
export default async function StudentClassPage({ params }: { params: Promise<{ classId: string }> }) { const { classId } = await params; return <ClassDetail id={classId} mode="student" />; }
