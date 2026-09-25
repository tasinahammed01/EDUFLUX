import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssignmentDto, SubmissionDto } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { StudentSubmissionDialog } from "./student-submission-dialog";
import * as uploadTransport from "./submission-upload";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
const assignment: AssignmentDto = { id: "assignment", classId: "class", title: "Essay", instructions: "Write a clear essay.", status: "PUBLISHED", dueAt: "2026-10-01T00:00:00.000Z", maxScore: 100, allowLateSubmission: false, allowResubmission: false, showMarks: true, hasRubric: true, resourceLinks: [], createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" };
const draft: SubmissionDto = { id: "submission", assignmentId: "assignment", classId: "class", status: "DRAFT", draftText: "", draftFiles: [], draftRevision: 0, latestAttemptNumber: 0, attempts: [], canSubmit: true, canResubmit: false, isLate: false, limits: { maxFiles: 5, maxFileBytes: 1000, maxTotalBytes: 5000, allowedMimeTypes: ["application/pdf", "image/png"] } };

describe("StudentSubmissionDialog", () => {
  beforeEach(() => { replace.mockReset(); vi.spyOn(classesApi, "submission").mockResolvedValue(draft); vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview"); vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("shows compact assignment context with only image and PDF methods", async () => {
    render(<StudentSubmissionDialog assignment={assignment} classId="class" onClose={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Essay" })).toBeVisible();
    expect(screen.getByText("Write a clear essay.")).toBeVisible();
    expect(screen.queryByRole("tab", { name: /Typed Response/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Drag and drop images")).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: /PDF/ }));
    expect(screen.getByText("Drag and drop PDF files")).toBeVisible();
  });

  it("rejects invalid files", async () => {
    render(<StudentSubmissionDialog assignment={assignment} classId="class" onClose={vi.fn()} />);
    await screen.findByRole("heading", { name: "Essay" });
    await userEvent.click(screen.getByRole("tab", { name: /PDF/ }));
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(["bad"], "bad.txt", { type: "text/plain" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Choose PDF files in PDF mode/);
  });

  it("persists accessible multi-image page ordering with the draft revision", async () => {
    const first = { id: "507f1f77bcf86cd799439011", originalName: "page-1.png", mimeType: "image/png" as const, sizeBytes: 3, status: "READY" as const, createdAt: "2026-09-24T00:00:00.000Z" };
    const second = { ...first, id: "507f1f77bcf86cd799439012", originalName: "page-2.png" };
    const orderedDraft = { ...draft, draftFiles: [first, second], draftRevision: 4 };
    vi.spyOn(classesApi, "submission").mockResolvedValue(orderedDraft);
    const reorder = vi.spyOn(classesApi, "reorderSubmissionFiles").mockResolvedValue({ ...orderedDraft, draftFiles: [second, first], draftRevision: 5 });
    render(<StudentSubmissionDialog assignment={assignment} classId="class" onClose={vi.fn()} />);
    expect(await screen.findByText("Page 1")).toBeVisible();
    expect(screen.getByRole("button", { name: "Move page-1.png up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move page-2.png down" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Move page-2.png up" }));
    await waitFor(() => expect(reorder).toHaveBeenCalledWith("class", "assignment", [second.id, first.id], 4));
    expect(screen.getAllByText(/Page [12]/)).toHaveLength(2);
  });

  it("submits once and redirects to the exact immutable attempt", async () => {
    const ready = { id: "file", originalName: "essay.png", mimeType: "image/png" as const, sizeBytes: 3, status: "READY" as const, createdAt: "2026-09-24T00:00:00.000Z" };
    vi.spyOn(classesApi, "uploadIntent").mockResolvedValue({ file: { ...ready, status: "PENDING" }, uploadUrl: "https://upload.test", expiresAt: "2026-09-24T01:00:00.000Z", requiredHeaders: { "content-type": "image/png" } });
    vi.spyOn(uploadTransport, "uploadToPresignedUrl").mockImplementation(async (file, url, headers, progress) => { progress(file.size); });
    vi.spyOn(classesApi, "finalizeSubmissionFile").mockResolvedValue(ready);
    vi.spyOn(classesApi, "saveSubmissionDraft").mockResolvedValue({ ...draft, draftFiles: [ready], draftRevision: 1 });
    let resolveSubmit!: (value: Awaited<ReturnType<typeof classesApi.submitAssignment>>) => void;
    const submit = vi.spyOn(classesApi, "submitAssignment").mockImplementation(() => new Promise((resolve) => { resolveSubmit = resolve; }));
    render(<StudentSubmissionDialog assignment={assignment} classId="class" onClose={vi.fn()} />);
    await screen.findByRole("heading", { name: "Essay" });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(["png"], "essay.png", { type: "image/png" })] } });
    const button = screen.getByRole("button", { name: "Submit Assignment" });
    button.click(); button.click();
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    resolveSubmit({ submission: { ...draft, id: "submission", status: "SUBMITTED", latestAttemptNumber: 1 }, attempt: { id: "attempt", attemptNumber: 1, submittedAt: "2026-09-24T00:00:00.000Z" }, evaluation: { id: "evaluation", status: "PENDING" } });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/student/classes/class/assignments/assignment/submissions/submission/attempts/attempt"));
    expect(replace).toHaveBeenCalledOnce();
  });

  it("does not redirect when final submission fails", async () => {
    const withFile = { ...draft, draftFiles: [{ id: "file", originalName: "essay.pdf", mimeType: "application/pdf" as const, sizeBytes: 3, status: "READY" as const, createdAt: "2026-09-24T00:00:00.000Z" }] };
    vi.spyOn(classesApi, "submission").mockResolvedValue(withFile);
    vi.spyOn(classesApi, "submitAssignment").mockRejectedValue(new Error("Submission rejected"));
    render(<StudentSubmissionDialog assignment={assignment} classId="class" onClose={vi.fn()} />);
    await screen.findByRole("heading", { name: "Essay" });
    await userEvent.click(screen.getByRole("button", { name: "Submit Assignment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Submission rejected");
    expect(replace).not.toHaveBeenCalled();
  });

  it("rejects an empty submission and never displays attempt 2 of 1", async () => {
    const view = render(<StudentSubmissionDialog assignment={assignment} classId="class" onClose={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Submit Assignment" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Upload at least one image or PDF");
    view.unmount();
    vi.spyOn(classesApi, "submission").mockResolvedValue({ ...draft, status: "SUBMITTED", latestAttemptNumber: 1, canSubmit: false, unavailableReason: "Maximum attempts reached." });
    render(<StudentSubmissionDialog assignment={{ ...assignment, studentSubmission: { assignmentId: "assignment", submissionState: "SUBMITTED", latestAttemptNumber: 1, canResubmit: false, isLate: false } }} classId="class" onClose={vi.fn()} />);
    expect(await screen.findByText("1 of 1")).toBeVisible();
    expect(screen.queryByText("2 of 1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit Assignment" })).toBeDisabled();
  });
});
