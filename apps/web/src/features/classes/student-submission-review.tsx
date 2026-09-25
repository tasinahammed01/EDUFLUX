"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { SubmissionReviewDto } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { SubmissionReview } from "./submission-review";

export function StudentSubmissionReview({
  classId,
  assignmentId,
  submissionId,
  attemptId,
}: {
  classId: string;
  assignmentId: string;
  submissionId: string;
  attemptId: string;
}) {
  const [review, setReview] = useState<SubmissionReviewDto | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(
    () =>
      classesApi
        .studentAttemptReview(classId, assignmentId, submissionId, attemptId)
        .then((value) => {
          setReview(value);
          setError("");
        })
        .catch((error: unknown) => {
          setError("This submission review could not be opened.");
          throw error;
        }),
    [assignmentId, attemptId, classId, submissionId],
  );
  const loadStatus = useCallback(
    () =>
      classesApi.studentAttemptReviewStatus(
        classId,
        assignmentId,
        submissionId,
        attemptId,
      ),
    [assignmentId, attemptId, classId, submissionId],
  );
  const reviewStatus = review?.status;
  const retryReview = useCallback(async () => {
    const status = await classesApi.retryStudentAttemptReview(
      classId,
      assignmentId,
      submissionId,
      attemptId,
    );
    setReview((current) => (current ? { ...current, ...status } : current));
  }, [assignmentId, attemptId, classId, submissionId]);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);
  useEffect(() => {
    if (!reviewStatus || !["PENDING", "PROCESSING"].includes(reviewStatus))
      return;
    let cancelled = false;
    let timer: number | undefined;
    let delay = 2500;
    const schedule = () => {
      if (!cancelled) timer = window.setTimeout(() => void poll(), delay);
    };
    const poll = async () => {
      try {
        const status = await loadStatus();
        if (cancelled) return;
        if (status.status === "COMPLETED" || status.status === "FAILED") {
          await load().catch(() => undefined);
          return;
        }
        setReview((current) => (current ? { ...current, ...status } : current));
        delay = 2500;
      } catch {
        delay = Math.min(10_000, Math.round(delay * 1.6));
      }
      schedule();
    };
    schedule();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [load, loadStatus, reviewStatus]);

  return (
    <main className="dashboard assignment-detail">
      <Link
        className="back-link"
        href={`/student/classes/${classId}/assignments/${assignmentId}`}
      >
        Back to assignment
      </Link>
      {error && <p role="alert">{error}</p>}
      {!review && !error && <p>Loading submission…</p>}
      {review && (
        <SubmissionReview
          review={review}
          onRefreshFiles={load}
          onRetryEvaluation={retryReview}
        />
      )}
    </main>
  );
}
