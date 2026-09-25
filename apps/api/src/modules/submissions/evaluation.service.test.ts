import { describe, expect, it, vi } from "vitest";
import type { AIProvider } from "../ai/ai-provider.service.js";
import type { EvaluationResult } from "./evaluation-schema.js";
import {
  discourseEvaluationSchema,
  evaluateInTwoPasses,
  languageEvaluationSchema,
  mergeEvaluationResults,
  normalizeEvaluationPass,
  validateAndRepairIssueOffsets,
} from "./evaluation.service.js";

const result = (
  issue: EvaluationResult["issues"][number],
): EvaluationResult => ({
  overallScore: 1,
  maxScore: 1,
  issues: [issue],
  correctionStats: { grammar: 1 },
  legendSummary: [],
  strengths: [],
  feedbackSections: [],
});
const issue = {
  id: "one",
  code: "AGR",
  label: "Subject–Verb Agreement",
  category: "grammar",
  originalText: "Students uses",
  suggestedText: "Students use",
} as const;
const rubric = {
  version: 1,
  title: "Essay rubric",
  description: "",
  levels: [],
  criteria: [],
};

describe("evaluation issue offset validation", () => {
  it("keeps exact offsets and repairs one safe nearby mismatch", () => {
    expect(
      validateAndRepairIssueOffsets(
        result({ ...issue, startIndex: 0, endIndex: 13 }),
        "Students uses media.",
      ).issues[0],
    ).toMatchObject({ startIndex: 0, endIndex: 13 });
    expect(
      validateAndRepairIssueOffsets(
        result({ ...issue, startIndex: 5, endIndex: 9 }),
        "Intro. Students uses media.",
      ).issues[0],
    ).toMatchObject({ startIndex: 7, endIndex: 20 });
  });
  it("removes unsafe offsets when the evidence occurs more than once", () => {
    const repaired = validateAndRepairIssueOffsets(
      result({ ...issue, startIndex: 2, endIndex: 4 }),
      "Students uses. Students uses.",
    ).issues[0]!;
    expect(repaired.startIndex).toBeUndefined();
    expect(repaired.endIndex).toBeUndefined();
  });
});

describe("two-pass evaluation merge", () => {
  it("normalizes bounded overlong discourse fields locally without a repair request", () => {
    const source = `Evidence ${"source ".repeat(60)}`.trim();
    const originalText = source.slice(0, 320);
    const normalized = normalizeEvaluationPass(
      {
        overallScore: 8,
        maxScore: 10,
        issues: [
          {
            id: "long-discourse",
            code: "DEV",
            originalText: ` model evidence ${"extra ".repeat(70)}`,
            suggestedText: `A focused replacement ${"detail ".repeat(60)}`,
            explanation: `A useful explanation ${"context ".repeat(55)}`,
            startIndex: 0,
            endIndex: originalText.length,
          },
        ],
        strengths: [],
        feedbackSections: [],
      },
      source,
      "discourse",
    );
    expect(normalized.issues[0]?.originalText).toBe(originalText);
    expect(normalized.issues[0]?.suggestedText?.length).toBeLessThanOrEqual(220);
    expect(normalized.issues[0]?.explanation?.length).toBeLessThanOrEqual(240);
  });

  it("rejects hard-limit payloads and non-canonical codes", () => {
    const base = {
      overallScore: 8,
      maxScore: 10,
      strengths: [],
      feedbackSections: [],
    };
    expect(() =>
      normalizeEvaluationPass(
        { ...base, issues: [{ ...issue, code: "DEV", originalText: "x".repeat(1_201) }] },
        "Essay",
        "discourse",
      ),
    ).toThrow();
    expect(() =>
      normalizeEvaluationPass(
        { ...base, issues: [{ ...issue, code: "OTHER" }] },
        "Essay",
        "discourse",
      ),
    ).toThrow();
  });
  it("accepts only the fields owned by each pass", () => {
    expect(
      languageEvaluationSchema.safeParse({ issues: [issue] }).success,
    ).toBe(true);
    expect(
      discourseEvaluationSchema.safeParse({
        overallScore: 8,
        maxScore: 10,
        issues: [],
        strengths: [],
        feedbackSections: [],
      }).success,
    ).toBe(true);
  });
  it("enforces the language and discourse code partitions", () => {
    expect(
      languageEvaluationSchema.safeParse({
        ...result(issue),
        issues: [
          { ...issue, code: "WC" },
          { ...issue, id: "spell", code: "SP" },
        ],
      }).success,
    ).toBe(true);
    expect(
      languageEvaluationSchema.safeParse({
        ...result(issue),
        issues: [{ ...issue, code: "REL" }],
      }).success,
    ).toBe(false);
    expect(
      discourseEvaluationSchema.safeParse({
        ...result(issue),
        issues: [
          { ...issue, code: "REL" },
          { ...issue, id: "coh", code: "COH" },
        ],
      }).success,
    ).toBe(true);
    expect(discourseEvaluationSchema.safeParse(result(issue)).success).toBe(
      false,
    );
  });
  it("preserves language and discourse codes without dropping categories", () => {
    const language = {
      ...result(issue),
      issues: [
        issue,
        {
          ...issue,
          id: "tense",
          code: "T",
          originalText: "was go",
          label: "Tense",
        },
        {
          ...issue,
          id: "word",
          code: "WC",
          originalText: "bigly",
          label: "Word Choice",
        },
        {
          ...issue,
          id: "spell",
          code: "SP",
          originalText: "recieve",
          label: "Spelling",
        },
      ],
    } as EvaluationResult;
    const discourse = {
      ...result({
        ...issue,
        id: "rel",
        code: "REL",
        originalText: "unrelated point",
        label: "Relevance",
        category: "content",
      }),
      issues: [
        {
          ...issue,
          id: "rel",
          code: "REL",
          originalText: "unrelated point",
          label: "Relevance",
          category: "content",
        },
        {
          ...issue,
          id: "dev",
          code: "DEV",
          originalText: "unsupported claim",
          label: "Idea Development",
          category: "content",
        },
        {
          ...issue,
          id: "coh",
          code: "COH",
          originalText: "Next unrelated",
          label: "Coherence",
          category: "organization",
        },
        {
          ...issue,
          id: "conc",
          code: "CONC",
          originalText: "The end",
          label: "Conclusion",
          category: "organization",
        },
      ],
    } as EvaluationResult;
    const merged = mergeEvaluationResults(language, discourse);
    expect(merged.issues.map((item) => item.code)).toEqual([
      "AGR",
      "T",
      "WC",
      "SP",
      "REL",
      "DEV",
      "COH",
      "CONC",
    ]);
    expect(merged.correctionStats).toMatchObject({
      grammar: 2,
      vocabulary: 1,
      mechanics: 1,
      content: 2,
      organization: 2,
    });
  });

  it("runs both pass-specific schemas in parallel and merges valid results", async () => {
    const generateStructured = vi.fn(
      async (request: { evaluationPass?: string }) => {
        const data =
          request.evaluationPass === "language"
            ? { issues: [issue] }
            : {
                overallScore: 8,
                maxScore: 10,
                issues: [],
                strengths: [{ title: "Focus", description: "Clear focus." }],
                feedbackSections: [],
              };
        return {
          data,
          model: "openai/gpt-4.1-mini",
          tokensUsed: 10,
        };
      },
    );
    const provider = { generateStructured } as unknown as AIProvider;
    const evaluated = await evaluateInTwoPasses(provider, {
      text: "Students uses media.",
      assignmentTitle: "Essay",
      assignmentPrompt: "Discuss media.",
      rubric,
      maxScore: 10,
    });
    expect(evaluated.result.issues).toHaveLength(1);
    expect(evaluated.result.overallScore).toBe(8);
    expect(
      generateStructured.mock.calls.map(([request]) => request.evaluationPass),
    ).toEqual(["language", "discourse"]);
  });

  it("rejects the whole evaluation when either parallel pass fails", async () => {
    const provider = {
      generateStructured: vi.fn((request: { evaluationPass?: string }) =>
        request.evaluationPass === "language"
          ? Promise.reject(new Error("language failed"))
          : Promise.resolve({
              data: {
                overallScore: 8,
                maxScore: 10,
                issues: [],
                strengths: [],
                feedbackSections: [],
              },
              model: "openai/gpt-4.1-mini",
              tokensUsed: 10,
            }),
      ),
    } as unknown as AIProvider;
    await expect(
      evaluateInTwoPasses(provider, {
        text: "Essay",
        assignmentTitle: "Essay",
        assignmentPrompt: "Discuss.",
        rubric,
        maxScore: 10,
      }),
    ).rejects.toThrow("language failed");
  });

  it("aborts and awaits the sibling pass after a definitive failure", async () => {
    let siblingAborted = false;
    const provider = {
      generateStructured: vi.fn((request: { evaluationPass?: string; signal?: AbortSignal }) => {
        if (request.evaluationPass === "language")
          return Promise.reject(new Error("language failed"));
        return new Promise((_, reject) => {
          request.signal?.addEventListener("abort", () => {
            siblingAborted = true;
            reject(new Error("sibling cancelled"));
          });
        });
      }),
    } as unknown as AIProvider;
    await expect(
      evaluateInTwoPasses(provider, {
        text: "Essay",
        assignmentTitle: "Essay",
        assignmentPrompt: "Discuss.",
        rubric,
        maxScore: 10,
      }),
    ).rejects.toThrow("language failed");
    expect(siblingAborted).toBe(true);
  });
});
