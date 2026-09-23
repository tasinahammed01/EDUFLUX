import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubmissionDto } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { StudentSubmission } from "./student-submission";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const draft: SubmissionDto = {
  id: "submission", assignmentId: "assignment", classId: "class", status: "DRAFT", draftText: "Essay", draftFiles: [], draftRevision: 1, latestAttemptNumber: 0, attempts: [], canSubmit: true, canResubmit: false, isLate: false,
  limits: { maxFiles: 5, maxFileBytes: 1000, maxTotalBytes: 5000, allowedMimeTypes: ["application/pdf"] },
};

describe("StudentSubmission", () => {
  afterEach(cleanup);
  beforeEach(() => { replace.mockReset(); vi.restoreAllMocks(); });
  it("redirects to the exact immutable attempt after the transaction succeeds", async () => {
    vi.spyOn(classesApi, "submission").mockResolvedValue(draft);
    vi.spyOn(classesApi, "submitAssignment").mockResolvedValue({
      submission: { ...draft, status: "SUBMITTED", latestAttemptNumber: 1 },
      attempt: { id: "attempt", attemptNumber: 1, submittedAt: "2026-09-23T00:00:00.000Z" },
      evaluation: { id: "evaluation", status: "PENDING" },
    });
    render(<StudentSubmission classId="class" assignmentId="assignment" />);
    await screen.findByDisplayValue("Essay");
    await userEvent.click(screen.getByRole("button", { name: "Submit work" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit attempt" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/student/classes/class/assignments/assignment/submissions/submission/attempts/attempt"));
    expect(classesApi.submitAssignment).toHaveBeenCalledOnce();
  });

  it("does not send a second submission while the first request is pending", async () => {
    vi.spyOn(classesApi, "submission").mockResolvedValue(draft);
    let resolveSubmit!: (value: Awaited<ReturnType<typeof classesApi.submitAssignment>>) => void;
    const submit = vi.spyOn(classesApi, "submitAssignment").mockImplementation(() => new Promise((resolve) => { resolveSubmit = resolve; }));
    render(<StudentSubmission classId="class" assignmentId="assignment" />);
    await screen.findByDisplayValue("Essay");
    await userEvent.click(screen.getByRole("button", { name: "Submit work" }));
    const confirm = screen.getByRole("button", { name: "Submit attempt" });
    confirm.click();
    confirm.click();
    expect(submit).toHaveBeenCalledOnce();
    resolveSubmit({
      submission: { ...draft, status: "SUBMITTED", latestAttemptNumber: 1 },
      attempt: { id: "attempt", attemptNumber: 1, submittedAt: "2026-09-23T00:00:00.000Z" },
      evaluation: { id: "evaluation", status: "PENDING" },
    });
    await waitFor(() => expect(replace).toHaveBeenCalledOnce());
  });
});
