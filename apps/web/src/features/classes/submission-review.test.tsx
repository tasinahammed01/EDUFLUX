import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { SubmissionReviewDto } from "@eduflux/shared-types";
import { SubmissionReview } from "./submission-review";

const review: SubmissionReviewDto = {
  id: "e", submissionId: "s", attemptId: "a", assignmentId: "assignment", classId: "class",
  student: { id: "student", displayName: "Ada Student", email: "ada@example.com" }, attemptNumber: 1,
  submittedAt: "2026-09-23T00:00:00.000Z", status: "COMPLETED", typedText: "Their is a claim.", transcribedText: "", effectiveText: "Their is a claim.", files: [],
  issues: [{ id: "i", code: "G", label: "Grammar", category: "grammar", originalText: "Their is", suggestedText: "There is", explanation: "Use the existential form.", startIndex: 0, endIndex: 8 }],
  overallScore: 82, maxScore: 100, correctionStats: { grammar: 1 }, legendSummary: [{ code: "G", label: "Grammar", count: 1 }],
  strengths: [{ title: "Clear claim", description: "The central claim is easy to identify." }],
  feedbackSections: [{ title: "Grammar", category: "Grammar", score: 16, maxScore: 20, summary: "Mostly accurate.", suggestions: ["Review homophones."] }],
  teacherComment: "Good progress.", updatedAt: "2026-09-23T00:01:00.000Z",
};

describe("SubmissionReview", () => {
  afterEach(cleanup);
  it("renders the shared score, issues, feedback, strengths and teacher comment", () => {
    render(<SubmissionReview review={review} />);
    expect(screen.getByText("Ada Student")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText("There is")).toBeInTheDocument();
    expect(screen.getByText("Clear Claim")).toBeInTheDocument();
    expect(screen.getByText("Good progress.")).toBeInTheDocument();
  });
  it("opens a keyboard and tap-accessible explanation from a text highlight", async () => {
    render(<SubmissionReview review={review} />);
    await userEvent.click(screen.getByRole("button", { name: /Their is/ }));
    expect(screen.getByRole("dialog", { name: "Correction G" })).toHaveTextContent("Use the existential form.");
  });
  it("maps pending and failed states without mislabeling pending as unconfigured", () => {
    const view = render(<SubmissionReview review={{ ...review, status: "PENDING" }} />);
    expect(screen.getByText("Preparing your review...")).toBeVisible();
    expect(screen.queryByText(/not configured/i)).not.toBeInTheDocument();
    view.rerender(<SubmissionReview review={{ ...review, status: "FAILED", statusMessage: "We could not complete the automated review. Your submission is still safely stored." }} />);
    expect(screen.getByText("We couldn't complete the automated review.")).toBeVisible();
    expect(screen.getByText("Submitted text")).toBeVisible();
  });
  it("renders normalized image annotations and shares selection with the text issue", async () => {
    const imageReview: SubmissionReviewDto = { ...review, typedText: "", transcribedText: "Their is a claim.", files: [{ id: "file", originalName: "work.png", mimeType: "image/png", sizeBytes: 10, status: "READY", createdAt: review.submittedAt, contentUrl: "https://example.test/work.png" }], issues: [{ ...review.issues[0]!, source: "OCR_FILE", sourceFileId: "file", wordIds: ["f1_p1_w0001"], pageNumbers: [1] }], ocrPages: [{ sourceFileId: "file", pageNumber: 1, width: 1000, height: 500, words: [{ id: "f1_p1_w0001", text: "Their", startOffset: 0, endOffset: 5, boundingBox: { x: .1, y: .2, width: .25, height: .1 } }] }] };
    render(<SubmissionReview review={imageReview} />);
    await userEvent.click(screen.getByRole("tab", { name: "View Uploaded Work" }));
    const marker = screen.getByRole("button", { name: /G: Use the existential form/ });
    expect(marker).toHaveStyle({ left: "10%", top: "20%", width: "25%", height: "10%" });
    await userEvent.click(marker);
    expect(screen.getByRole("dialog", { name: "Correction G" })).toHaveTextContent("There is");
    await userEvent.click(screen.getByRole("tab", { name: "View Transcribed Text" }));
    await userEvent.click(screen.getByRole("button", { name: /Their is/ }));
    await userEvent.click(screen.getByRole("tab", { name: "View Uploaded Work" }));
    expect(screen.getByRole("button", { name: /G: Use the existential form/ })).toHaveClass("selected");
  });
});
