"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SubmissionReviewDto } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { SubmissionReview } from "./submission-review";

export function TeacherSubmissionDetail({
  classId,
  assignmentId,
  submissionId,
}: {
  classId: string;
  assignmentId: string;
  submissionId: string;
}) {
  const [review, setReview] = useState<SubmissionReviewDto | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    classesApi.teacherSubmissionReview(classId, assignmentId, submissionId).then(setReview).catch(() => setError("Submission not found."));
  }, [assignmentId, classId, submissionId]);
  useEffect(() => {
    if (!review || !["PENDING", "PROCESSING"].includes(review.status)) return;
    const timer = window.setInterval(() => {
      void classesApi.teacherSubmissionReview(classId, assignmentId, submissionId).then(setReview);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [assignmentId, classId, review, submissionId]);

  return (
    <main className="dashboard assignment-detail">
      <Link className="back-link" href={`/teacher/classes/${classId}/assignments/${assignmentId}`}>
        Back to assignment
      </Link>
      <Link href={`/teacher/classes/${classId}/assignments/${assignmentId}`}>View all submissions</Link>
      {error && <p role="alert">{error}</p>}
      {!review && !error && <p>Loading submission…</p>}
      {review && <SubmissionReview review={review} onSaveComment={async (comment) => {
        const value = await classesApi.saveTeacherComment(classId, assignmentId, submissionId, comment);
        setReview(value);
        return value;
      }} />}
    </main>
  );
}
