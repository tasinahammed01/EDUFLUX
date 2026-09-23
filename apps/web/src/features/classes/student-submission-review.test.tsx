import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubmissionReviewDto } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { StudentSubmissionReview } from "./student-submission-review";

const base: SubmissionReviewDto = {
  id: "evaluation", submissionId: "submission", attemptId: "attempt", assignmentId: "assignment", classId: "class",
  student: { id: "student", displayName: "Student", email: "student@example.com" }, attemptNumber: 1,
  submittedAt: "2026-09-23T00:00:00.000Z", status: "PENDING", typedText: "Essay", transcribedText: "", effectiveText: "Essay", files: [], issues: [], correctionStats: {}, legendSummary: [], strengths: [], feedbackSections: [], updatedAt: "2026-09-23T00:00:00.000Z",
};

describe("StudentSubmissionReview", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
  it("polls pending and processing reviews, then stops after completion", async () => {
    vi.useFakeTimers();
    const request = vi.spyOn(classesApi, "studentAttemptReview")
      .mockResolvedValueOnce(base)
      .mockResolvedValueOnce({ ...base, status: "PROCESSING" })
      .mockResolvedValueOnce({ ...base, status: "COMPLETED", overallScore: 9, maxScore: 10, strengths: [{ title: "Clear", description: "Focused response" }] });
    render(<StudentSubmissionReview classId="class" assignmentId="assignment" submissionId="submission" attemptId="attempt" />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("Preparing your review...")).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(screen.getByText("Analyzing your submission...")).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(screen.getByText("9")).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(request).toHaveBeenCalledTimes(3);
    expect(request).toHaveBeenLastCalledWith("class", "assignment", "submission", "attempt");
  });

  it("stops polling after a failed review while keeping the submission view available", async () => {
    vi.useFakeTimers();
    const request = vi.spyOn(classesApi, "studentAttemptReview")
      .mockResolvedValueOnce(base)
      .mockResolvedValueOnce({ ...base, status: "FAILED", statusMessage: "Evaluation unavailable" });
    render(<StudentSubmissionReview classId="class" assignmentId="assignment" submissionId="submission" attemptId="attempt" />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(screen.getByText("We couldn't complete the automated review.")).toBeVisible();
    expect(screen.getByText("Submitted text")).toBeVisible();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(request).toHaveBeenCalledTimes(2);
  });
});
