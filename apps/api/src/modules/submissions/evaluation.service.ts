import type { RubricRevisionRecord } from "../assignments/rubric-revision.model.js";
import { createAIProvider, getAIProviderConfig } from "../ai/ai-provider.service.js";
import { env } from "../../config/env.js";
import { evaluationResultSchema, type EvaluationResult } from "./evaluation-schema.js";

export interface EvaluationProvider { evaluate(input: { text: string; assignmentTitle: string; assignmentPrompt: string; rubric: RubricRevisionRecord["rubric"]; maxScore: number }): Promise<{ result: EvaluationResult; provider: string; model: string; tokensUsed?: number }>; }
let override: EvaluationProvider | undefined;
export function setEvaluationProviderForTests(provider?: EvaluationProvider) { override = provider; }

class AiEvaluationProvider implements EvaluationProvider {
  async evaluate(input: { text: string; assignmentTitle: string; assignmentPrompt: string; rubric: RubricRevisionRecord["rubric"]; maxScore: number }) {
    const provider = createAIProvider(getAIProviderConfig(env.AI_EVALUATION_MODEL));
    const response = await provider.generateStructured({
      task: "evaluation",
      schema: evaluationResultSchema,
      temperature: 0.2,
      maxTokens: 6000,
      systemPrompt: `You are a careful education assessor. Return only valid JSON with this exact shape:
{"overallScore":number,"maxScore":number,"issues":[{"id":string,"code":string,"label":string,"category":string,"severity":"low"|"medium"|"high","originalText":string,"suggestedText":string,"explanation":string,"startIndex":number,"endIndex":number,"page":number}],"correctionStats":{"category":number},"legendSummary":[{"code":string,"label":string,"count":number}],"strengths":[{"title":string,"description":string}],"feedbackSections":[{"title":string,"category":string,"score":number,"maxScore":number,"summary":string,"suggestions":[string]}]}.
Evaluate only from the provided evidence and rubric. Scores must not exceed their maxima. Omit optional issue fields when unknown. Issue offsets, when present, refer to the exact effective text.`,
      userPrompt: JSON.stringify({ assignment: { title: input.assignmentTitle, prompt: input.assignmentPrompt }, rubric: input.rubric, maxScore: input.maxScore, submissionText: input.text }),
    });
    return { result: response.data, provider: env.AI_PROVIDER, model: response.model, tokensUsed: response.tokensUsed };
  }
}
export function getEvaluationProvider() { return override ?? new AiEvaluationProvider(); }
