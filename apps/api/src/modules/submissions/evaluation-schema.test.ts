import { describe, expect, it } from "vitest";
import { evaluationResultSchema } from "./evaluation-schema.js";

const valid = {
  overallScore: 82, maxScore: 100,
  issues: [{ id: "one", code: "G", label: "Grammar", category: "grammar", originalText: "Their is", suggestedText: "There is" }],
  correctionStats: { grammar: 1 }, legendSummary: [{ code: "G", label: "Grammar", count: 1 }],
  strengths: [{ title: "Clear position", description: "The response maintains a clear claim." }],
  feedbackSections: [{ title: "Grammar", category: "grammar", score: 16, maxScore: 20, summary: "Mostly accurate.", suggestions: ["Review homophones."] }],
};

describe("evaluationResultSchema", () => {
  it("accepts a complete structured review", () => expect(evaluationResultSchema.parse(valid).overallScore).toBe(82));
  it("rejects scores above the maximum", () => expect(evaluationResultSchema.safeParse({ ...valid, overallScore: 101 }).success).toBe(false));
  it("rejects malformed issue data", () => expect(evaluationResultSchema.safeParse({ ...valid, issues: [{ id: "x" }] }).success).toBe(false));
});
