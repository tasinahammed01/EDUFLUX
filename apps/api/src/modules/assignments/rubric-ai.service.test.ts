import { beforeEach, describe, expect, it, vi } from "vitest";
import { rubricSchema } from "@eduflux/validation";
import { generateRubricWithAI, normalizeRubricCandidate } from "./rubric-ai.service.js";
import { findAssignment } from "./assignment.repository.js";
import { createAIProvider } from "../ai/ai-provider.service.js";

vi.mock("./assignment.repository.js", () => ({ findAssignment: vi.fn() }));
vi.mock("../ai/ai-provider.service.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../ai/ai-provider.service.js")>();
  return { ...original, getAIProviderConfig: vi.fn(() => ({ provider: "openrouter", apiKey: "server-key", model: "openai/gpt-4.1-mini" })), createAIProvider: vi.fn() };
});

const roughPrompt = "create a rubrics of 100 mark with organization, vocab, choarance, clarity of writting.";

describe("AI rubric candidate normalization", () => {
  beforeEach(() => vi.clearAllMocks());
  it("normalizes the rough-prompt result without inventing grading content", () => {
    expect(roughPrompt).toContain("choarance");
    const candidate = normalizeRubricCandidate({
      version: "1", title: " Essay Rubric ", description: " Assessment rubric ",
      levels: [
        { id: "excellent", label: " Excellent ", description: "Consistently strong", percentage: "100" },
        { id: "good", label: "Good", description: "Usually strong", percentage: "80" },
        { id: "satisfactory", label: "Satisfactory", description: "Adequate", percentage: "60" },
        { id: "needs_improvement", label: "Needs Improvement", description: "Limited", percentage: "40" },
      ],
      criteria: ["Organization", "Vocabulary", "Coherence", "Clarity of Writing"].map((title, index) => ({
        id: title.toLowerCase().replaceAll(" ", "_"), title: ` ${title} `, description: `${title} quality`, weight: index === 0 ? "40" : "20", descriptors: ["Excellent", "Good", "Adequate", "Needs improvement"],
      })),
    });
    const parsed = rubricSchema.parse(candidate);
    expect(parsed.criteria.map((criterion) => criterion.title)).toEqual(["Organization", "Vocabulary", "Coherence", "Clarity of Writing"]);
    expect(parsed.criteria.reduce((total, criterion) => total + criterion.weight, 0)).toBe(100);
    expect(parsed.criteria.every((criterion) => criterion.descriptors.length === parsed.levels.length)).toBe(true);
  });

  it("does not normalize an invalid total weight into acceptance", () => {
    const candidate = normalizeRubricCandidate({ version: 1, title: "Rubric", description: "", levels: [{ id: "high", label: "High", description: "High", percentage: 100 }, { id: "low", label: "Low", description: "Low", percentage: 50 }], criteria: [{ id: "content", title: "Content", description: "", weight: "90", descriptors: ["High", "Low"] }] });
    expect(rubricSchema.safeParse(candidate).success).toBe(false);
  });

  it("returns the exact rough-prompt result without persisting it", async () => {
    vi.mocked(findAssignment).mockResolvedValue({ _id: "assignment", classId: { toString: () => "class" }, title: "Essay", description: "Write clearly", instructions: "Use evidence" } as never);
    const draft = rubricSchema.parse(normalizeRubricCandidate({
      version: 1, title: "Essay Rubric", description: "Draft",
      levels: [{ id: "excellent", label: "Excellent", description: "Excellent", percentage: 100 }, { id: "good", label: "Good", description: "Good", percentage: 80 }, { id: "satisfactory", label: "Satisfactory", description: "Satisfactory", percentage: 60 }, { id: "needs_improvement", label: "Needs Improvement", description: "Needs improvement", percentage: 40 }],
      criteria: ["Organization", "Vocabulary", "Coherence", "Clarity of Writing"].map((title, index) => ({ id: title.toLowerCase().replaceAll(" ", "_"), title, description: title, weight: index === 0 ? 40 : 20, descriptors: ["Excellent", "Good", "Satisfactory", "Needs improvement"] })),
    }));
    const generateStructured = vi.fn().mockResolvedValue({ data: draft, model: "openai/gpt-4.1-mini", tokensUsed: 100 });
    vi.mocked(createAIProvider).mockReturnValue({ generateStructured });
    await expect(generateRubricWithAI("assignment", "class", roughPrompt)).resolves.toEqual(draft);
    expect(generateStructured).toHaveBeenCalledWith(expect.objectContaining({ task: "rubric", userPrompt: expect.stringContaining(roughPrompt) }));
    expect(findAssignment).toHaveBeenCalledOnce();
  });
});
