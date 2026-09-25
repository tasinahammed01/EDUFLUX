import type { RubricRevisionRecord } from "../assignments/rubric-revision.model.js";
import type { AIProvider } from "../ai/ai-provider.service.js";
import {
  createAIProvider,
  getAIProviderConfig,
} from "../ai/ai-provider.service.js";
import { env } from "../../config/env.js";
import {
  discourseEvaluationFeedbackSectionSchema,
  discourseEvaluationIssueSchema,
  discourseEvaluationStrengthSchema,
  evaluationIssueSchema,
  evaluationWireIssueSchema,
  evaluationResultSchema,
  type EvaluationResult,
} from "./evaluation-schema.js";
import { z } from "zod";

const LANGUAGE_CODES = new Set([
  "T",
  "VF",
  "AGR",
  "FRAG",
  "RO",
  "WO",
  "ART",
  "PREP",
  "WC",
  "WF",
  "REP",
  "FORM",
  "COL",
  "SP",
  "P",
  "CAP",
  "SPC",
  "FMT",
]);
const DISCOURSE_CODES = new Set([
  "REL",
  "DEV",
  "TA",
  "CL",
  "SD",
  "COH",
  "CO",
  "PU",
  "TS",
  "CONC",
]);
const EVALUATION_LIMITS = {
  languageMaxTokens: 6_500,
  discourseMaxTokens: 6_500,
  repairMaxTokens: 6_500,
  truncationRetryMaxTokens: 7_000,
  requestTimeoutMs: 55_000,
} as const;
export const languageEvaluationSchema = z
  .object({
    issues: z.array(evaluationIssueSchema).max(120),
  })
  .superRefine((value, context) => {
    value.issues.forEach((issue, index) => {
      if (!LANGUAGE_CODES.has(issue.code))
        context.addIssue({
          code: "custom",
          path: ["issues", index, "code"],
          message: "Code is not allowed in the language pass",
        });
    });
  });
export const discourseEvaluationSchema = z
  .object({
    overallScore: z.number().min(0),
    maxScore: z.number().positive(),
    issues: z.array(discourseEvaluationIssueSchema).max(36),
    strengths: z.array(discourseEvaluationStrengthSchema).max(8),
    feedbackSections: z.array(discourseEvaluationFeedbackSectionSchema).max(16),
  })
  .superRefine((value, context) => {
    if (value.overallScore > value.maxScore) {
      context.addIssue({
        code: "custom",
        path: ["overallScore"],
        message: "Score exceeds maximum",
      });
    }
    value.issues.forEach((issue, index) => {
      if (!DISCOURSE_CODES.has(issue.code))
        context.addIssue({
          code: "custom",
          path: ["issues", index, "code"],
          message: "Code is not allowed in the discourse pass",
        });
    });
  });

export const languageEvaluationWireSchema = z
  .object({ issues: z.array(evaluationWireIssueSchema).max(120) })
  .superRefine((value, context) => {
    value.issues.forEach((issue, index) => {
      if (!LANGUAGE_CODES.has(issue.code))
        context.addIssue({
          code: "custom",
          path: ["issues", index, "code"],
          message: "Code is not allowed in the language pass",
        });
    });
  });

export const discourseEvaluationWireSchema = z
  .object({
    overallScore: z.number().min(0),
    maxScore: z.number().positive(),
    issues: z.array(evaluationWireIssueSchema).max(36),
    strengths: z.array(discourseEvaluationStrengthSchema).max(8),
    feedbackSections: z.array(discourseEvaluationFeedbackSectionSchema).max(16),
  })
  .superRefine((value, context) => {
    if (value.overallScore > value.maxScore)
      context.addIssue({
        code: "custom",
        path: ["overallScore"],
        message: "Score exceeds maximum",
      });
    value.issues.forEach((issue, index) => {
      if (!DISCOURSE_CODES.has(issue.code))
        context.addIssue({
          code: "custom",
          path: ["issues", index, "code"],
          message: "Code is not allowed in the discourse pass",
        });
    });
  });

type LanguageEvaluation = z.infer<typeof languageEvaluationSchema>;
type DiscourseEvaluation = z.infer<typeof discourseEvaluationSchema>;

export interface EvaluationProvider {
  evaluate(input: EvaluationInput): Promise<{
    result: EvaluationResult;
    provider: string;
    model: string;
    tokensUsed?: number;
  }>;
}
type EvaluationInput = {
  text: string;
  assignmentTitle: string;
  assignmentPrompt: string;
  rubric: RubricRevisionRecord["rubric"];
  maxScore: number;
};
let override: EvaluationProvider | undefined;
export function setEvaluationProviderForTests(provider?: EvaluationProvider) {
  override = provider;
}

class AiEvaluationProvider implements EvaluationProvider {
  async evaluate(input: EvaluationInput) {
    const provider = createAIProvider(
      getAIProviderConfig(env.AI_EVALUATION_MODEL),
    );
    const generated = await evaluateInTwoPasses(provider, input);
    return {
      result: generated.result,
      provider: env.AI_PROVIDER,
      model: generated.model,
      tokensUsed: generated.tokensUsed,
    };
  }
}

export async function evaluateInTwoPasses(
  provider: AIProvider,
  input: EvaluationInput,
) {
  const issueRules = `Each issue MUST represent exactly one correction. Never combine multiple problems in one issue.
originalText MUST be the smallest exact span needed to identify the error and must be copied verbatim from submissionText. suggestedText must replace only originalText. Keep explanations concise (one or two sentences) and never rewrite paragraphs.
startIndex is inclusive and endIndex is exclusive in the exact submissionText. Omit offsets rather than guessing.
Only report defensible errors. The server derives label and category from code; never invent codes.`;
  const userPrompt = JSON.stringify({
    assignment: {
      title: input.assignmentTitle,
      instructions: input.assignmentPrompt,
    },
    rubric: input.rubric,
    maxScore: input.maxScore,
    submissionText: input.text,
  });
  const evaluationController = new AbortController();
  let firstFailure: unknown;
  const runPass = async <T>(work: () => Promise<T>) => {
    try {
      return await work();
    } catch (error) {
      if (firstFailure === undefined) {
        firstFailure = error;
        evaluationController.abort("sibling_pass_failed");
      }
      throw error;
    }
  };
  const settled = await Promise.allSettled([
    runPass(() => provider.generateStructured({
      task: "evaluation",
      evaluationPass: "language",
      schema: languageEvaluationWireSchema,
      temperature: 0.15,
      maxTokens: EVALUATION_LIMITS.languageMaxTokens,
      repairMaxTokens: EVALUATION_LIMITS.repairMaxTokens,
      timeoutMs: EVALUATION_LIMITS.requestTimeoutMs,
      signal: evaluationController.signal,
      systemPrompt: `You are the language proofreading pass. Return only valid JSON with this exact shape:
{"issues":[{"id":string,"code":string,"severity":"low"|"medium"|"high","originalText":string,"suggestedText":string,"explanation":string,"startIndex":number,"endIndex":number,"page":number}]}.
${issueRules}
Systematically inspect every sentence for these language codes only: T, VF, AGR, FRAG, RO, WO, ART, PREP, WC, WF, REP, FORM, COL, SP, P, CAP, SPC, FMT. Do not return content or organization codes. Return at most 120 concise, atomic issues.`,
      userPrompt,
    })),
    runPass(() => provider.generateStructured({
      task: "evaluation",
      evaluationPass: "discourse",
      schema: discourseEvaluationWireSchema,
      temperature: 0.2,
      maxTokens: EVALUATION_LIMITS.discourseMaxTokens,
      repairMaxTokens: EVALUATION_LIMITS.repairMaxTokens,
      truncationRetry: {
        maxTokens: EVALUATION_LIMITS.truncationRetryMaxTokens,
        systemPromptSuffix:
          "This is a fresh retry after output truncation. Regenerate the complete JSON from the supplied assignment, rubric, and submission. Be maximally concise, deduplicate findings with the same code and location, and do not include commentary or repeat evidence.",
      },
      timeoutMs: EVALUATION_LIMITS.requestTimeoutMs,
      signal: evaluationController.signal,
      systemPrompt: `You are the rubric and discourse assessment pass. Return only valid JSON with this exact shape:
{"overallScore":number,"maxScore":number,"issues":[{"id":string,"code":string,"severity":"low"|"medium"|"high","originalText":string,"suggestedText":string,"explanation":string,"startIndex":number,"endIndex":number,"page":number}],"strengths":[{"title":string,"description":string}],"feedbackSections":[{"title":string,"category":string,"score":number,"maxScore":number,"summary":string,"suggestions":[string]}]}.
${issueRules}
Evaluate only from the assignment, exact bound rubric, and submission. Use these discourse codes only: REL, DEV, TA, CL, SD, COH, CO, PU, TS, CONC. Do not return grammar, vocabulary, or mechanics codes. Produce final rubric scores, strengths, and feedback; scores must not exceed their maxima. Return at most 36 distinct, concise, atomic issues. Deduplicate findings that use the same code and location or restate the same weakness. Evidence must be the smallest useful span, never a whole paragraph unless structurally unavoidable.`,
      userPrompt,
    })),
  ]);
  if (firstFailure !== undefined) throw firstFailure;
  const language = settled[0].status === "fulfilled" ? settled[0].value : undefined;
  const discourse = settled[1].status === "fulfilled" ? settled[1].value : undefined;
  if (!language || !discourse) throw new Error("Evaluation pass did not complete");
  const normalizedLanguage = normalizeEvaluationPass(
    language.data,
    input.text,
    "language",
  );
  const normalizedDiscourse = normalizeEvaluationPass(
    discourse.data,
    input.text,
    "discourse",
  );
  return {
    result: mergeEvaluationResults(
      validateAndRepairIssueOffsets(normalizedLanguage, input.text),
      validateAndRepairIssueOffsets(normalizedDiscourse, input.text),
    ),
    model: discourse.model,
    tokensUsed: language.tokensUsed + discourse.tokensUsed,
  };
}

export function normalizeEvaluationPass(
  candidate: unknown,
  sourceText: string,
  pass: "language",
): LanguageEvaluation;
export function normalizeEvaluationPass(
  candidate: unknown,
  sourceText: string,
  pass: "discourse",
): DiscourseEvaluation;
export function normalizeEvaluationPass(
  candidate: unknown,
  sourceText: string,
  pass: "language" | "discourse",
): LanguageEvaluation | DiscourseEvaluation {
  const wire = (pass === "language"
    ? languageEvaluationWireSchema
    : discourseEvaluationWireSchema
  ).parse(candidate);
  const normalized = {
    ...wire,
    issues: wire.issues.map((issue) => {
      const validOffsets =
        issue.startIndex !== undefined &&
        issue.endIndex !== undefined &&
        issue.startIndex >= 0 &&
        issue.endIndex > issue.startIndex &&
        issue.endIndex <= sourceText.length;
      const originalText = validOffsets
        ? sourceText.slice(issue.startIndex!, issue.endIndex!)
        : boundedText(issue.originalText, pass === "discourse" ? 180 : 500);
      return {
        ...issue,
        originalText,
        ...(issue.suggestedText === undefined
          ? {}
          : { suggestedText: boundedText(issue.suggestedText, pass === "discourse" ? 220 : 500) }),
        ...(issue.explanation === undefined
          ? {}
          : { explanation: boundedText(issue.explanation, pass === "discourse" ? 240 : 800) }),
      };
    }),
  };
  return pass === "language"
    ? languageEvaluationSchema.parse(normalized)
    : discourseEvaluationSchema.parse(normalized);
}

function boundedText(value: string, maximum: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maximum) return normalized;
  const clipped = normalized.slice(0, Math.max(1, maximum - 1));
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary > maximum * 0.65 ? boundary : clipped.length).trimEnd()}…`;
}
export function getEvaluationProvider() {
  return override ?? new AiEvaluationProvider();
}

export function validateAndRepairIssueOffsets<
  T extends { issues: EvaluationResult["issues"] },
>(result: T, text: string): T {
  return {
    ...result,
    issues: result.issues.map((issue) => {
      if (issue.startIndex === undefined || issue.endIndex === undefined)
        return issue;
      const expected = comparable(issue.originalText);
      if (
        expected &&
        comparable(text.slice(issue.startIndex, issue.endIndex)) === expected
      )
        return issue;
      const from = Math.max(0, issue.startIndex - 180),
        to = Math.min(text.length, issue.endIndex + 180);
      const exactStart = text.indexOf(issue.originalText, from);
      if (
        exactStart >= 0 &&
        exactStart < to &&
        text.indexOf(issue.originalText, exactStart + 1) < 0
      ) {
        return {
          ...issue,
          startIndex: exactStart,
          endIndex: exactStart + issue.originalText.length,
        };
      }
      const matches: Array<{ startIndex: number; endIndex: number }> = [];
      for (let startIndex = from; startIndex < to; startIndex++)
        for (
          let endIndex = startIndex + 1;
          endIndex <= Math.min(to, startIndex + issue.originalText.length + 40);
          endIndex++
        ) {
          if (comparable(text.slice(startIndex, endIndex)) === expected)
            matches.push({ startIndex, endIndex });
          if (matches.length > 1) break;
        }
      if (matches.length === 1) return { ...issue, ...matches[0] };
      const {
        startIndex: _start,
        endIndex: _end,
        ...withoutUnsafeOffsets
      } = issue;
      return withoutUnsafeOffsets;
    }),
  } as T;
}
function comparable(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLocaleLowerCase();
}

export function mergeEvaluationResults(
  language: LanguageEvaluation,
  discourse: DiscourseEvaluation,
): EvaluationResult {
  const chosen: EvaluationResult["issues"] = [];
  for (const candidate of [...language.issues, ...discourse.issues]) {
    const duplicateIndex = chosen.findIndex(
      (existing) =>
        existing.code === candidate.code &&
        (comparable(existing.originalText) ===
          comparable(candidate.originalText) ||
          offsetsOverlap(existing, candidate)),
    );
    if (duplicateIndex < 0) {
      chosen.push(candidate);
      continue;
    }
    if (issueQuality(candidate) > issueQuality(chosen[duplicateIndex]!))
      chosen[duplicateIndex] = candidate;
  }
  const usedIds = new Set<string>();
  const issues = chosen.map((issue, index) => {
    const id = usedIds.has(issue.id) ? `${issue.id}-${index + 1}` : issue.id;
    usedIds.add(id);
    return { ...issue, id };
  });
  return evaluationResultSchema.parse({
    ...discourse,
    issues,
    correctionStats: {},
    legendSummary: [],
  });
}
function offsetsOverlap(
  a: EvaluationResult["issues"][number],
  b: EvaluationResult["issues"][number],
) {
  return (
    a.startIndex !== undefined &&
    a.endIndex !== undefined &&
    b.startIndex !== undefined &&
    b.endIndex !== undefined &&
    a.startIndex < b.endIndex &&
    b.startIndex < a.endIndex
  );
}
function issueQuality(issue: EvaluationResult["issues"][number]) {
  return (
    (issue.startIndex !== undefined && issue.endIndex !== undefined
      ? 10000
      : 0) +
    (issue.suggestedText ? 1000 : 0) -
    issue.originalText.length
  );
}
