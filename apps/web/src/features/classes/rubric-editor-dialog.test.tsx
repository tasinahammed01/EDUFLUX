import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssignmentDto } from "@eduflux/shared-types";
import { classesApi } from "@/lib/api/classes";
import { RubricEditorDialog } from "./rubric-editor-dialog";

const assignment: AssignmentDto = {
  id: "assignment", classId: "class", title: "Essay", description: "Write clearly.", status: "DRAFT", maxScore: 100,
  allowLateSubmission: false, allowResubmission: false, showMarks: true, hasRubric: false, rubricLocked: false,
  resourceLinks: [], createdAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-20T00:00:00.000Z",
};
const generated = {
  version: 1, title: "Essay Rubric", description: "",
  levels: [
    { id: "excellent", label: "Excellent", description: "Excellent", percentage: 100 },
    { id: "good", label: "Good", description: "Good", percentage: 80 },
    { id: "satisfactory", label: "Satisfactory", description: "Satisfactory", percentage: 60 },
    { id: "needs_improvement", label: "Needs Improvement", description: "Needs improvement", percentage: 40 },
  ],
  criteria: ["Organization", "Vocabulary", "Coherence", "Clarity of Writing"].map((title, index) => ({ id: title.toLowerCase().replaceAll(" ", "_"), title, description: title, weight: index === 0 ? 40 : 20, descriptors: ["Excellent", "Good", "Satisfactory", "Needs improvement"] })),
};

describe("RubricEditorDialog AI draft", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("renders the rough-prompt result as an editable unsaved draft", async () => {
    vi.spyOn(classesApi, "getRubric").mockResolvedValue({ locked: false });
    const generate = vi.spyOn(classesApi, "generateRubric").mockResolvedValue(generated);
    const save = vi.spyOn(classesApi, "saveRubric");
    render(<RubricEditorDialog open assignment={assignment} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const prompt = "create a rubrics of 100 mark with organization, vocab, choarance, clarity of writting.";
    fireEvent.change(screen.getByPlaceholderText(/Create a rubric for a 500-word/), { target: { value: prompt } });
    await userEvent.click(screen.getByRole("button", { name: "Generate with AI" }));
    await waitFor(() => expect(generate).toHaveBeenCalledWith("class", "assignment", prompt));
    expect(screen.getByDisplayValue("Organization")).toBeEnabled();
    expect(screen.getByDisplayValue("Vocabulary")).toBeEnabled();
    expect(screen.getByDisplayValue("Coherence")).toBeEnabled();
    expect(screen.getByDisplayValue("Clarity of Writing")).toBeEnabled();
    expect(screen.getByText("Total Weight: 100 / 100")).toBeVisible();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Apply Changes" })).toBeEnabled();
  });
});
