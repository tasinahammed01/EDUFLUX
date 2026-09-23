"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { SubmissionReviewDto } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { SubmissionReview } from "./submission-review";

export function StudentSubmissionReview({ classId, assignmentId, submissionId, attemptId }: { classId: string; assignmentId: string; submissionId: string; attemptId: string }) {
  const [review, setReview] = useState<SubmissionReviewDto | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => classesApi.studentAttemptReview(classId, assignmentId, submissionId, attemptId).then((value) => { setReview(value); setError(""); }).catch(() => setError("This submission review could not be opened.")), [assignmentId, attemptId, classId, submissionId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!review || !["PENDING", "PROCESSING"].includes(review.status)) return;
    const timer = window.setInterval(() => { void load(); }, 2500);
    return () => window.clearInterval(timer);
  }, [load, review]);

  return <main className="dashboard assignment-detail">
    <Link className="back-link" href={`/student/classes/${classId}/assignments/${assignmentId}`}>Back to assignment</Link>
    {error && <p role="alert">{error}</p>}
    {!review && !error && <p>Loading submission…</p>}
    {review && <SubmissionReview review={review} />}
  </main>;
}
