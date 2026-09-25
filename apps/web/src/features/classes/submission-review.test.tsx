import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubmissionReviewDto } from "@eduflux/shared-types";
import { SubmissionReview } from "./submission-review";

const review: SubmissionReviewDto = {
  id: "e",
  submissionId: "s",
  attemptId: "a",
  assignmentId: "assignment",
  classId: "class",
  student: {
    id: "student",
    displayName: "Ada Student",
    email: "ada@example.com",
  },
  attemptNumber: 1,
  submittedAt: "2026-09-23T00:00:00.000Z",
  status: "COMPLETED",
  typedText: "Their is a claim.",
  transcribedText: "",
  effectiveText: "Their is a claim.",
  files: [],
  issues: [
    {
      id: "i",
      code: "AGR",
      label: "Subject–Verb Agreement",
      category: "grammar",
      originalText: "Their is",
      suggestedText: "There is",
      explanation: "Use the existential form.",
      startIndex: 0,
      endIndex: 8,
    },
  ],
  overallScore: 82,
  maxScore: 100,
  correctionStats: { grammar_and_mechanics: 1 },
  legendSummary: [{ code: "G", label: "Grammar", count: 1 }],
  strengths: [
    {
      title: "Clear claim",
      description: "The central claim is easy to identify.",
    },
  ],
  feedbackSections: [
    {
      title: "Grammar",
      category: "Grammar",
      score: 16,
      maxScore: 20,
      summary: "Mostly accurate.",
      suggestions: ["Review homophones."],
    },
  ],
  teacherComment: "Good progress.",
  updatedAt: "2026-09-23T00:01:00.000Z",
};

describe("SubmissionReview", () => {
  afterEach(cleanup);
  it("renders the shared score, issues, feedback, strengths and teacher comment", () => {
    const { container } = render(<SubmissionReview review={review} />);
    expect(screen.getByText("Ada Student")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText(/Their is → There is/)).toBeInTheDocument();
    expect(screen.getByText("Skills to strengthen")).toBeInTheDocument();
    expect(screen.getByText("How to practice")).toBeInTheDocument();
    expect(screen.getByText("Grammar Issues")).toBeInTheDocument();
    expect(screen.getByText("Content Issues")).toBeInTheDocument();
    expect(screen.getByText("Organization Issues")).toBeInTheDocument();
    expect(screen.getByText("Vocabulary Issues")).toBeInTheDocument();
    expect(screen.getByText("Mechanics Issues")).toBeInTheDocument();
    expect(screen.queryByText("grammar_and_mechanics")).not.toBeInTheDocument();
    expect(screen.getByText("Clear Claim")).toBeInTheDocument();
    expect(screen.getByText("Good progress.")).toBeInTheDocument();
    expect(container.querySelector(".review-sidebar")).toBeInTheDocument();
    expect(
      container.querySelector(".review-content-column"),
    ).toBeInTheDocument();
  });
  it("opens a keyboard and tap-accessible explanation from a text highlight", async () => {
    render(<SubmissionReview review={review} />);
    await userEvent.click(
      screen.getByRole("button", {
        name: "Their is: Use the existential form.",
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "Correction AGR" }),
    ).toHaveTextContent("Use the existential form.");
    expect(screen.getByRole("dialog", { name: "Correction AGR" })).toHaveClass(
      "review-error-popover",
    );
    expect(
      screen.getByRole("dialog", { name: "Correction AGR" }),
    ).not.toHaveClass("review-issue-drawer");
    await userEvent.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "Correction AGR" }),
    ).not.toBeInTheDocument();
  });
  it("maps pending and failed states without mislabeling pending as unconfigured", () => {
    const view = render(
      <SubmissionReview review={{ ...review, status: "PENDING" }} />,
    );
    expect(screen.getByText("Preparing your review...")).toBeVisible();
    expect(screen.getByText("Upload complete")).toBeVisible();
    expect(screen.getByText("Reading uploaded work")).toBeVisible();
    expect(screen.getByText("Analyzing errors")).toBeVisible();
    expect(screen.getByText("Preparing feedback")).toBeVisible();
    expect(screen.queryByText(/not configured/i)).not.toBeInTheDocument();
    view.rerender(
      <SubmissionReview
        review={{
          ...review,
          status: "FAILED",
          statusMessage:
            "We could not complete the automated review. Your submission is still safely stored.",
        }}
      />,
    );
    expect(
      screen.getByText("Automated feedback couldn't be completed."),
    ).toBeVisible();
    expect(screen.getByText(/Transcribed Text/)).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Their is: Use the existential form.",
      }),
    ).toBeVisible();
    expect(screen.queryByText("Overall Score")).not.toBeInTheDocument();
    expect(screen.queryByText("Correction Statistics")).not.toBeInTheDocument();
  });
  it("keeps the compact stored-file fallback when OCR produced no text", () => {
    render(
      <SubmissionReview
        review={{
          ...review,
          status: "FAILED",
          typedText: "",
          effectiveText: "",
          files: [
            {
              id: "file",
              originalName: "unreadable.png",
              mimeType: "image/png",
              sizeBytes: 10,
              status: "READY",
              createdAt: review.submittedAt,
              contentUrl: "https://example.test/unreadable.png",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Submitted work")).toBeVisible();
    expect(screen.getByRole("link", { name: /unreadable.png/ })).toBeVisible();
    expect(screen.queryByText(/Transcribed Text/)).not.toBeInTheDocument();
  });
  it("offers the existing failed AI review an in-place retry action", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    render(
      <SubmissionReview
        review={{ ...review, status: "FAILED", failureStage: "AI_EVALUATION" }}
        onRetryEvaluation={retry}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Retry automated review" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByText("Retrying automated review...")).toBeVisible();
  });
  it("renders normalized image annotations and shares selection with the text issue", async () => {
    const imageReview: SubmissionReviewDto = {
      ...review,
      typedText: "",
      transcribedText: "Their is a claim.",
      files: [
        {
          id: "file",
          originalName: "work.png",
          mimeType: "image/png",
          sizeBytes: 10,
          status: "READY",
          createdAt: review.submittedAt,
          contentUrl: "https://example.test/work.png",
        },
      ],
      issues: [
        {
          ...review.issues[0]!,
          source: "OCR_FILE",
          sourceFileId: "file",
          wordIds: ["f1_p1_w0001"],
          pageNumbers: [1],
        },
      ],
      ocrPages: [
        {
          sourceFileId: "file",
          pageNumber: 1,
          width: 1000,
          height: 500,
          startOffset: 0,
          endOffset: 17,
          text: "Their is a claim.",
          words: [
            {
              id: "f1_p1_w0001",
              text: "Their",
              startOffset: 0,
              endOffset: 5,
              boundingBox: { x: 0.1, y: 0.2, width: 0.25, height: 0.1 },
            },
          ],
        },
      ],
    };
    render(<SubmissionReview review={imageReview} />);
    await userEvent.click(
      screen.getByRole("button", { name: "View Uploaded Work" }),
    );
    fireEvent.load(
      screen.getByRole("img", { name: "Submitted file work.png" }),
    );
    const marker = screen.getByRole("button", {
      name: /AGR: Use the existential form/,
    });
    expect(marker).toHaveStyle({
      left: "10%",
      top: "20%",
      width: "25%",
      height: "10%",
    });
    await userEvent.click(marker);
    expect(
      screen.getByRole("dialog", { name: "Correction AGR" }),
    ).toHaveTextContent("There is");
    await userEvent.click(
      screen.getByRole("button", { name: "View Transcribed Text" }),
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Their is: Use the existential form.",
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "View Uploaded Work" }),
    );
    fireEvent.load(
      screen.getByRole("img", { name: "Submitted file work.png" }),
    );
    expect(
      screen.getByRole("button", { name: /AGR: Use the existential form/ }),
    ).toHaveClass("selected");
  });
  it("switches between multiple images without rendering a blank document frame", async () => {
    const files = ["page-one.png", "page-two.png"].map(
      (originalName, index) => ({
        id: `file-${index}`,
        originalName,
        mimeType: "image/png" as const,
        sizeBytes: 10,
        status: "READY" as const,
        createdAt: review.submittedAt,
        contentUrl: `https://example.test/${originalName}`,
      }),
    );
    render(<SubmissionReview review={{ ...review, files }} />);
    await userEvent.click(
      screen.getByRole("button", { name: "View Uploaded Work" }),
    );
    expect(
      screen.getByRole("img", { name: "Submitted file page-one.png" }),
    ).toHaveAttribute("src", files[0]!.contentUrl);
    await userEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(
      screen.getByRole("img", { name: "Submitted file page-two.png" }),
    ).toHaveAttribute("src", files[1]!.contentUrl);
    fireEvent.error(
      screen.getByRole("img", { name: "Submitted file page-two.png" }),
    );
    expect(await screen.findByText("Preview unavailable")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Open original file" }),
    ).toHaveAttribute("href", files[1]!.contentUrl);
  });
  it("renders every OCR page in one full-width transcription document", () => {
    const files = ["page-one.png", "page-two.png"].map(
      (originalName, index) => ({
        id: `file-${index}`,
        originalName,
        mimeType: "image/png" as const,
        sizeBytes: 10,
        status: "READY" as const,
        createdAt: review.submittedAt,
      }),
    );
    const { container } = render(
      <SubmissionReview
        review={{
          ...review,
          typedText: "",
          transcribedText: "First page text.\nSecond page text.",
          effectiveText: "First page text.\nSecond page text.",
          files,
          issues: [],
          ocrPages: [
            {
              sourceFileId: "file-0",
              pageNumber: 1,
              width: 1000,
              height: 1400,
              startOffset: 0,
              endOffset: 16,
              text: "First page text.",
              words: [],
            },
            {
              sourceFileId: "file-1",
              pageNumber: 1,
              width: 1000,
              height: 1400,
              startOffset: 17,
              endOffset: 34,
              text: "Second page text.",
              words: [],
            },
          ],
        }}
      />,
    );
    expect(screen.getByText(/Page 1 .* page-one\.png/)).toBeVisible();
    expect(screen.getByText(/Page 2 .* page-two\.png/)).toBeVisible();
    expect(container.querySelectorAll(".review-text-page")).toHaveLength(2);
    expect(container.querySelectorAll(".review-page-text")).toHaveLength(2);
  });
  it("lets teachers edit comments while keeping the student view read-only", async () => {
    const onSaveComment = vi.fn().mockResolvedValue(review);
    render(<SubmissionReview review={review} onSaveComment={onSaveComment} />);
    const input = screen.getByRole("textbox", { name: "Teacher comment" });
    await userEvent.clear(input);
    await userEvent.type(input, "Excellent revision.");
    await userEvent.click(screen.getByRole("button", { name: "Save Comment" }));
    expect(onSaveComment).toHaveBeenCalledWith("Excellent revision.");
  });
  it("shows all 28 canonical entries in the full legend dialog and closes with Escape", async () => {
    render(<SubmissionReview review={review} />);
    await userEvent.click(
      screen.getByRole("button", { name: "View full correction legend" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Correction Legend" });
    expect(dialog.querySelectorAll("code")).toHaveLength(28);
    await userEvent.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "Correction Legend" }),
    ).not.toBeInTheDocument();
  });
});
