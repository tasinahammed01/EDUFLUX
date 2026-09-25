import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubmissionReviewDto } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { StudentSubmissionReview } from "./student-submission-review";

const base: SubmissionReviewDto = {
  id: "evaluation",
  submissionId: "submission",
  attemptId: "attempt",
  assignmentId: "assignment",
  classId: "class",
  student: {
    id: "student",
    displayName: "Student",
    email: "student@example.com",
  },
  attemptNumber: 1,
  submittedAt: "2026-09-23T00:00:00.000Z",
  status: "PENDING",
  typedText: "Essay",
  transcribedText: "",
  effectiveText: "Essay",
  files: [],
  issues: [],
  correctionStats: {},
  legendSummary: [],
  strengths: [],
  feedbackSections: [],
  updatedAt: "2026-09-23T00:00:00.000Z",
};

describe("StudentSubmissionReview", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it("polls pending and processing reviews, then stops after completion", async () => {
    vi.useFakeTimers();
    const fullReview = vi
      .spyOn(classesApi, "studentAttemptReview")
      .mockResolvedValueOnce(base)
      .mockResolvedValueOnce({
        ...base,
        status: "COMPLETED",
        overallScore: 9,
        maxScore: 10,
        strengths: [{ title: "Clear", description: "Focused response" }],
      });
    const statusRequest = vi
      .spyOn(classesApi, "studentAttemptReviewStatus")
      .mockResolvedValueOnce({
        status: "PROCESSING",
        processingStage: "OCR",
        statusMessage: "Reading your uploaded work...",
        updatedAt: base.updatedAt,
      })
      .mockResolvedValueOnce({
        status: "COMPLETED",
        processingStage: "COMPLETED",
        updatedAt: base.updatedAt,
      });
    render(
      <StudentSubmissionReview
        classId="class"
        assignmentId="assignment"
        submissionId="submission"
        attemptId="attempt"
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Preparing your review...")).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(screen.getByText("Reading your uploaded work...")).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(screen.getByText("9")).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(statusRequest).toHaveBeenCalledTimes(2);
    expect(fullReview).toHaveBeenCalledTimes(2);
    expect(fullReview).toHaveBeenLastCalledWith(
      "class",
      "assignment",
      "submission",
      "attempt",
    );
  });

  it("stops polling after a failed review while keeping the submission view available", async () => {
    vi.useFakeTimers();
    const fullReview = vi
      .spyOn(classesApi, "studentAttemptReview")
      .mockResolvedValueOnce(base)
      .mockResolvedValueOnce({
        ...base,
        status: "FAILED",
        statusMessage: "Evaluation unavailable",
      });
    const statusRequest = vi
      .spyOn(classesApi, "studentAttemptReviewStatus")
      .mockResolvedValueOnce({
        status: "FAILED",
        failureStage: "AI_EVALUATION",
        failureCode: "AI_RESPONSE_TRUNCATED",
        updatedAt: base.updatedAt,
      });
    render(
      <StudentSubmissionReview
        classId="class"
        assignmentId="assignment"
        submissionId="submission"
        attemptId="attempt"
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(
      screen.getByText("Automated feedback couldn't be completed."),
    ).toBeVisible();
    expect(screen.getByText(/Transcribed Text/)).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(statusRequest).toHaveBeenCalledTimes(1);
    expect(fullReview).toHaveBeenCalledTimes(2);
  });
});
