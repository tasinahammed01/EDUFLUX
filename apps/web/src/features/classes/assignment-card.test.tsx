import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AssignmentDto } from "@eduflux/shared-types";
import { AssignmentCard } from "./assignment-card";

const assignment: AssignmentDto = {
  id: "assignment-1",
  classId: "class-1",
  title: "Argument essay",
  description: "Make a supported claim.",
  status: "PUBLISHED",
  maxScore: 100,
  allowLateSubmission: false,
  allowResubmission: true,
  showMarks: true,
  hasRubric: true,
  rubricRevisionNumber: 2,
  rubricLocked: true,
  resourceLinks: [],
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

describe("AssignmentCard", () => {
  it("offers one explicit publish action only for a rubric-backed draft", async () => {
    const publish = vi.fn();
    const draft: AssignmentDto = { ...assignment, status: "DRAFT", hasRubric: false, rubricLocked: false };
    delete draft.rubricRevisionNumber;
    const view = render(<AssignmentCard assignment={draft} classId="class-1" mode="teacher" onPublish={publish} />);
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();

    view.rerender(<AssignmentCard assignment={{ ...draft, hasRubric: true, rubricRevisionNumber: 1 }} classId="class-1" mode="teacher" onPublish={publish} />);
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(publish).toHaveBeenCalledOnce();

    view.rerender(<AssignmentCard assignment={{ ...assignment, rubricLocked: false }} classId="class-1" mode="teacher" onPublish={publish} />);
    expect(screen.getByText("published")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
  });

  it("renders batch statistics and a locked rubric state for teachers", () => {
    render(
      <AssignmentCard
        assignment={assignment}
        classId="class-1"
        mode="teacher"
        submissionStats={{ submitted: 4, total: 5 }}
        onViewSubmissions={vi.fn()}
        onShowRubric={vi.fn()}
      />,
    );
    expect(screen.getByText(/4\/5 Submitted/)).toBeVisible();
    expect(screen.getByRole("button", { name: "View rubric" })).toHaveAttribute(
      "title",
      "Locked after student submission.",
    );
  });

  it("renders a read-only batch submission summary without a full submission DTO", () => {
    render(
      <AssignmentCard
        assignment={assignment}
        classId="class-1"
        mode="student"
        submission={{
          assignmentId: assignment.id,
          submissionId: "submission-1",
          submissionState: "SUBMITTED",
          latestAttemptNumber: 2,
          latestAttemptId: "attempt-2",
          evaluationStatus: "COMPLETED",
          canResubmit: true,
          isLate: false,
        }}
      />,
    );
    expect(screen.getByText(/Submitted .* Attempt 2/)).toBeVisible();
    expect(screen.getByRole("link", { name: "View Review" })).toHaveAttribute("href", "/student/classes/class-1/assignments/assignment-1/submissions/submission-1/attempts/attempt-2");
    expect(screen.getByRole("button", { name: "Submit New Attempt" })).toBeVisible();
  });
});
