import { z } from "zod";

export const evaluationResultSchema = z.object({
  overallScore: z.number().min(0),
  maxScore: z.number().positive(),
  issues: z.array(z.object({
    id: z.string().min(1).max(100), code: z.string().min(1).max(30), label: z.string().min(1).max(100),
    category: z.string().min(1).max(100), severity: z.enum(["low", "medium", "high"]).optional(),
    originalText: z.string().max(2000), suggestedText: z.string().max(2000).optional(), explanation: z.string().max(3000).optional(),
    startIndex: z.number().int().min(0).optional(), endIndex: z.number().int().min(0).optional(), page: z.number().int().min(1).optional(),
  })).max(200),
  correctionStats: z.record(z.string().max(100), z.number().int().min(0)),
  legendSummary: z.array(z.object({ code: z.string().max(30), label: z.string().max(100), count: z.number().int().min(0) })).max(50),
  strengths: z.array(z.object({ title: z.string().max(150), description: z.string().max(2000) })).max(20),
  feedbackSections: z.array(z.object({ title: z.string().max(150), category: z.string().max(100), score: z.number().min(0), maxScore: z.number().positive(), summary: z.string().max(3000), suggestions: z.array(z.string().max(2000)).max(20) })).max(30),
}).superRefine((value, context) => {
  if (value.overallScore > value.maxScore) context.addIssue({ code: "custom", path: ["overallScore"], message: "Score exceeds maximum" });
});
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
