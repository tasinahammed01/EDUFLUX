"use client";

import { useCallback, useEffect, useState } from "react";
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
  const refresh = useCallback(async () => {
    const value = await classesApi.teacherSubmissionReview(
      classId,
      assignmentId,
      submissionId,
    );
    setReview(value);
    setError("");
  }, [assignmentId, classId, submissionId]);
  const loadStatus = useCallback(
    () =>
      classesApi.teacherSubmissionReviewStatus(
        classId,
        assignmentId,
        submissionId,
      ),
    [assignmentId, classId, submissionId],
  );
  const reviewStatus = review?.status;

  useEffect(() => {
    classesApi
      .teacherSubmissionReview(classId, assignmentId, submissionId)
      .then(setReview)
      .catch(() => setError("Submission not found."));
  }, [assignmentId, classId, submissionId]);
  useEffect(() => {
    if (!reviewStatus || !["PENDING", "PROCESSING"].includes(reviewStatus))
      return;
    let cancelled = false;
    let timer: number | undefined;
    let delay = 3000;
    const schedule = () => {
      if (!cancelled) timer = window.setTimeout(() => void poll(), delay);
    };
    const poll = async () => {
      try {
        const status = await loadStatus();
        if (cancelled) return;
        if (status.status === "COMPLETED" || status.status === "FAILED") {
          await refresh().catch(() => undefined);
          return;
        }
        setReview((current) => (current ? { ...current, ...status } : current));
        delay = 3000;
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
  }, [loadStatus, refresh, reviewStatus]);

  return (
    <main className="dashboard assignment-detail">
      <Link
        className="back-link"
        href={`/teacher/classes/${classId}/assignments/${assignmentId}`}
      >
        Back to assignment
      </Link>
      <Link href={`/teacher/classes/${classId}/assignments/${assignmentId}`}>
        View all submissions
      </Link>
      {error && <p role="alert">{error}</p>}
      {!review && !error && <p>Loading submission…</p>}
      {review && (
        <SubmissionReview
          review={review}
          onRefreshFiles={refresh}
          onSaveComment={async (comment) => {
            const value = await classesApi.saveTeacherComment(
              classId,
              assignmentId,
              submissionId,
              comment,
            );
            setReview(value);
            return value;
          }}
        />
      )}
    </main>
  );
}
