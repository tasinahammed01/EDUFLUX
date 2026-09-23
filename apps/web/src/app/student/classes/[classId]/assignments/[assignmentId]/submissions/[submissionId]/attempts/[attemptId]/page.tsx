import { StudentSubmissionReview } from "@/features/classes/student-submission-review";

export default async function Page({ params }: { params: Promise<{ classId: string; assignmentId: string; submissionId: string; attemptId: string }> }) {
  const resolved = await params;
  return <StudentSubmissionReview {...resolved} />;
}
