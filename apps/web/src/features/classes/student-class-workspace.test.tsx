import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssignmentDto, ClassSummary, SubmissionDto } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { StudentClassWorkspace } from "./student-class-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
const klass: ClassSummary = { id: "class", name: "Academic Writing", role: "STUDENT", joinedAt: "2026-09-01T00:00:00.000Z", createdAt: "2026-09-01T00:00:00.000Z" };
const assignment = (status: AssignmentDto["status"], id: string): AssignmentDto => ({ id, classId: "class", title: status === "PUBLISHED" ? "Published Essay" : "Hidden Draft", instructions: "Write an essay.", status, maxScore: 100, allowLateSubmission: false, allowResubmission: false, showMarks: true, hasRubric: true, studentSubmission: { assignmentId: id, submissionState: "NONE", latestAttemptNumber: 0, canResubmit: false, isLate: false }, resourceLinks: [], createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" });
const draft: SubmissionDto = { id: "submission", assignmentId: "published", classId: "class", status: "DRAFT", draftText: "", draftFiles: [], draftRevision: 0, latestAttemptNumber: 0, attempts: [], canSubmit: true, canResubmit: false, isLate: false, limits: { maxFiles: 5, maxFileBytes: 1000, maxTotalBytes: 5000, allowedMimeTypes: ["image/png", "application/pdf"] } };

describe("StudentClassWorkspace assignments", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  it("renders every published assignment, hides drafts, and creates no submission until the modal opens", async () => {
    vi.spyOn(classesApi, "one").mockResolvedValue(klass);
    vi.spyOn(classesApi, "assignments").mockResolvedValue({ assignments: [assignment("PUBLISHED", "published"), assignment("DRAFT", "draft")], total: 2 });
    const openSubmission = vi.spyOn(classesApi, "submission").mockResolvedValue(draft);
    render(<StudentClassWorkspace id="class" />);
    expect(await screen.findByText("Published Essay")).toBeVisible();
    expect(screen.queryByText("Hidden Draft")).not.toBeInTheDocument();
    expect(openSubmission).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Submit Assignment" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeVisible();
    expect(within(dialog).getByText("Write an essay.")).toBeVisible();
    expect(openSubmission).toHaveBeenCalledOnce();
  });
});
