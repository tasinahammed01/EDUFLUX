import { TeacherSubmissionDetail } from "@/features/classes/teacher-submission-detail";

export default async function Page({
  params,
}: {
  params: Promise<{ classId: string; assignmentId: string; submissionId: string }>;
}) {
  return <TeacherSubmissionDetail {...(await params)} />;
}
