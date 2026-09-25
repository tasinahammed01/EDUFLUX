import { describe, expect, it } from "vitest";
import { evaluationResultSchema } from "./evaluation-schema.js";

const valid = {
  overallScore: 82, maxScore: 100,
  issues: [{ id: "one", code: "AGR", label: "Wrong model label", category: "vocabulary", originalText: "Students uses", suggestedText: "Students use" }],
  correctionStats: { vocabulary: 99 }, legendSummary: [],
  strengths: [{ title: "Clear position", description: "The response maintains a clear claim." }],
  feedbackSections: [{ title: "Grammar", category: "grammar", score: 16, maxScore: 20, summary: "Mostly accurate.", suggestions: ["Review homophones."] }],
};

describe("evaluationResultSchema", () => {
  it("accepts a complete structured review and derives canonical issue metadata", () => expect(evaluationResultSchema.parse(valid)).toMatchObject({ overallScore: 82, issues: [{ code: "AGR", label: "Subject–Verb Agreement", category: "grammar" }], correctionStats: { grammar: 1 } }));
  it("rejects scores above the maximum", () => expect(evaluationResultSchema.safeParse({ ...valid, overallScore: 101 }).success).toBe(false));
  it("rejects malformed issue data", () => expect(evaluationResultSchema.safeParse({ ...valid, issues: [{ id: "x" }] }).success).toBe(false));
  it("rejects unknown correction codes instead of converting fresh issues to OTHER", () => expect(evaluationResultSchema.safeParse({ ...valid, issues: [{ ...valid.issues[0], code: "grammar_and_mechanics" }] }).success).toBe(false));
});
