import { z } from "zod";
import { CORRECTION_CODES, CORRECTION_LEGEND } from "@eduflux/shared-types";

const correctionCodeSchema = z.enum(
  CORRECTION_CODES as [
    (typeof CORRECTION_CODES)[number],
    ...(typeof CORRECTION_CODES)[number][],
  ],
);

export function createEvaluationIssueSchema(limits: {
  originalText: number;
  suggestedText: number;
  explanation: number;
}) {
  return z
    .object({
      id: z.string().min(1).max(100),
      code: correctionCodeSchema,
      label: z.string().min(1).max(100).optional(),
      category: z.string().min(1).max(100).optional(),
      severity: z.enum(["low", "medium", "high"]).optional(),
      originalText: z.string().max(limits.originalText),
      suggestedText: z.string().max(limits.suggestedText).optional(),
      explanation: z.string().max(limits.explanation).optional(),
      startIndex: z.number().int().min(0).optional(),
      endIndex: z.number().int().min(0).optional(),
      page: z.number().int().min(1).optional(),
    })
    .transform((issue) => ({
      ...issue,
      label: CORRECTION_LEGEND[issue.code].label,
      category: CORRECTION_LEGEND[issue.code].category,
    }));
}

export const evaluationIssueSchema = createEvaluationIssueSchema({
  originalText: 1_200,
  suggestedText: 500,
  explanation: 800,
});

export const discourseEvaluationIssueSchema = createEvaluationIssueSchema({
  originalText: 1_200,
  suggestedText: 220,
  explanation: 240,
});

// Transport limits are deliberately larger than the concise persisted form.
// They remain bounded so structurally useful model output can be normalized
// locally instead of requiring a second billable provider request.
export const evaluationWireIssueSchema = createEvaluationIssueSchema({
  originalText: 1_200,
  suggestedText: 1_600,
  explanation: 1_200,
});

export const evaluationStrengthSchema = z.object({
  title: z.string().max(150),
  description: z.string().max(1_000),
});
export const discourseEvaluationStrengthSchema = z.object({
  title: z.string().max(120),
  description: z.string().max(600),
});

export const evaluationFeedbackSectionSchema = z.object({
  title: z.string().max(150),
  category: z.string().max(100),
  score: z.number().min(0),
  maxScore: z.number().positive(),
  summary: z.string().max(1_500),
  suggestions: z.array(z.string().max(500)).max(12),
});
export const discourseEvaluationFeedbackSectionSchema = z.object({
  title: z.string().max(120),
  category: z.string().max(80),
  score: z.number().min(0),
  maxScore: z.number().positive(),
  summary: z.string().max(700),
  suggestions: z.array(z.string().max(300)).max(8),
});

export const evaluationResultSchema = z
  .object({
    overallScore: z.number().min(0),
    maxScore: z.number().positive(),
    issues: z.array(evaluationIssueSchema).max(200),
    correctionStats: z.record(z.string().max(100), z.number().int().min(0)),
    legendSummary: z
      .array(
        z.object({
          code: z.string().max(30),
          label: z.string().max(100),
          count: z.number().int().min(0),
        }),
      )
      .max(50),
    strengths: z.array(evaluationStrengthSchema).max(20),
    feedbackSections: z.array(evaluationFeedbackSectionSchema).max(30),
  })
  .superRefine((value, context) => {
    if (value.overallScore > value.maxScore) {
      context.addIssue({
        code: "custom",
        path: ["overallScore"],
        message: "Score exceeds maximum",
      });
    }
  })
  .transform((value) => {
    const correctionStats: Record<string, number> = {
      content: 0,
      organization: 0,
      grammar: 0,
      vocabulary: 0,
      mechanics: 0,
    };
    const legendCounts = new Map<string, number>();
    for (const issue of value.issues) {
      correctionStats[issue.category] =
        (correctionStats[issue.category] ?? 0) + 1;
      legendCounts.set(issue.code, (legendCounts.get(issue.code) ?? 0) + 1);
    }
    return {
      ...value,
      correctionStats,
      legendSummary: [...legendCounts].map(([code, count]) => ({
        code,
        label: CORRECTION_LEGEND[code as keyof typeof CORRECTION_LEGEND].label,
        count,
      })),
    };
  });
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
