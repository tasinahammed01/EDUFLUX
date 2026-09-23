/**
 * Rubric AI Generation Service
 * Handles AI-powered rubric generation for assignments
 */

import { z } from "zod";
import { AIProviderError, createAIProvider, getAIProviderConfig, type StructuredGenerationRequest } from "../ai/ai-provider.service.js";
import { findAssignment } from "./assignment.repository.js";
import { ApiError } from "../../utils/api-error.js";
import { rubricSchema } from "@eduflux/validation";
import pino from "pino";
import { env } from "../../config/env.js";

const rubricAiLogger = pino({ level: env.LOG_LEVEL });

const generatedRubricSchema = rubricSchema.superRefine((rubric, context) => {
  const levelIds = rubric.levels.map((level) => level.id);
  const criterionIds = rubric.criteria.map((criterion) => criterion.id);
  if (new Set(levelIds).size !== levelIds.length) context.addIssue({ code: "custom", path: ["levels"], message: "Level IDs must be unique" });
  if (new Set(criterionIds).size !== criterionIds.length) context.addIssue({ code: "custom", path: ["criteria"], message: "Criterion IDs must be unique" });
  rubric.levels.forEach((level, index) => {
    if (index > 0 && level.percentage >= rubric.levels[index - 1]!.percentage) context.addIssue({ code: "custom", path: ["levels", index, "percentage"], message: "Level percentages must be in descending order" });
  });
});

export function normalizeRubricCandidate(candidate: unknown): unknown {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;
  const source = candidate as Record<string, unknown>;
  const numeric = (value: unknown) => typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : value;
  const text = (value: unknown) => typeof value === "string" ? value.trim() : value;
  return {
    ...source,
    version: numeric(source.version),
    title: text(source.title),
    description: text(source.description),
    levels: Array.isArray(source.levels) ? source.levels.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const level = item as Record<string, unknown>;
      return { ...level, id: text(level.id), label: text(level.label), description: text(level.description), percentage: numeric(level.percentage) };
    }) : source.levels,
    criteria: Array.isArray(source.criteria) ? source.criteria.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const criterion = item as Record<string, unknown>;
      return { ...criterion, id: text(criterion.id), title: text(criterion.title), description: text(criterion.description), weight: numeric(criterion.weight), descriptors: Array.isArray(criterion.descriptors) ? criterion.descriptors.map(text) : criterion.descriptors };
    }) : source.criteria,
  };
}

/**
 * System prompt for rubric generation
 */
const RUBRIC_SYSTEM_PROMPT = `You are an expert educational assessment designer. Your task is to create high-quality, educationally appropriate rubrics for assignments.

Generate a rubric with the following requirements:
- 2-6 performance levels (e.g., Excellent, Good, Satisfactory, Needs Improvement)
- 4-6 criteria relevant to the assignment type
- Each criterion must have a weight (integer 1-100)
- All criterion weights must total exactly 100
- Each criterion must have a descriptor for every performance level
- Descriptors should be concise, measurable, and specific
- Use clear, educationally appropriate language
- Avoid overlapping criteria
- Interpret spelling mistakes in the teacher request by educational context (for example, "choarance" means "coherence")
- Use stable unique lowercase snake_case IDs
- Order levels from highest to lowest percentage
- Return ONLY valid JSON matching the required schema
- No markdown, no HTML, no explanations outside the JSON

The rubric structure must include:
- version: number (default 1)
- title: string (rubric title)
- description: string (use an empty string when no description is needed)
- levels: array of performance levels with id, label, description, percentage
- criteria: array of criteria with id, title, description, weight, descriptors array`;

/**
 * User prompt template for rubric generation
 */
function buildRubricPrompt(assignment: {
  title: string;
  description?: string;
  instructions?: string;
}, teacherPrompt: string): string {
  let prompt = `Assignment: ${assignment.title}\n`;

  if (assignment.description) {
    prompt += `Description: ${assignment.description}\n`;
  }

  if (assignment.instructions) {
    prompt += `Instructions: ${assignment.instructions}\n`;
  }

  prompt += `\nTeacher request (interpret spelling errors without changing intent): ${teacherPrompt}\n`;
  prompt += `\nGenerate a rubric for this assignment following the system requirements.`;

  return prompt;
}

/**
 * Generates a rubric using AI
 */
export async function generateRubricWithAI(
  assignmentId: string,
  classId: string,
  teacherPrompt: string,
): Promise<z.infer<typeof rubricSchema>> {
  // Load assignment context
  const assignment = await findAssignment(assignmentId);
  if (!assignment || assignment.classId.toString() !== classId) {
    throw new ApiError(404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
  }

  // Validate prompt length
  if (teacherPrompt.length < 10 || teacherPrompt.length > 4000) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Prompt must be between 10 and 4000 characters.",
    );
  }

  try {
    // Get AI provider configuration
    const config = getAIProviderConfig();
    const aiProvider = createAIProvider(config);

    // Build prompts
    const userPrompt = buildRubricPrompt(assignment, teacherPrompt);

    // Generate structured rubric
    const request: StructuredGenerationRequest<z.infer<typeof rubricSchema>> = {
      task: "rubric",
      systemPrompt: RUBRIC_SYSTEM_PROMPT,
      userPrompt,
      schema: generatedRubricSchema,
      normalize: normalizeRubricCandidate,
      temperature: 0.7,
      maxTokens: 2000,
    };

    const response = await aiProvider.generateStructured(request);

    // Validate the response (double-check)
    const validated = rubricSchema.parse(response.data);

    return validated;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    const providerError = error instanceof AIProviderError ? error : undefined;
    rubricAiLogger.error({
      provider: env.AI_PROVIDER,
      model: env.AI_RUBRIC_MODEL,
      stage: providerError?.stage ?? "VALIDATION",
      ...(providerError?.httpStatus ? { httpStatus: providerError.httpStatus } : {}),
      ...(providerError?.providerCode ? { providerCode: providerError.providerCode } : {}),
      ...(providerError?.issuePaths.length ? { issuePaths: providerError.issuePaths } : {}),
      code: providerError?.code ?? "RUBRIC_GENERATION_FAILED",
    }, "[rubric-ai] failed");
    const clientMessage = providerError?.code === "AI_PROVIDER_AUTH_FAILED"
      ? "AI service authentication failed. Please check server configuration."
      : providerError?.code === "AI_PROVIDER_RATE_LIMITED"
        ? "AI service is temporarily busy. Please try again shortly."
        : providerError?.code === "AI_PROVIDER_TIMEOUT"
          ? "AI service timed out. Please try again."
          : "Could not generate a valid rubric. Please try again.";
    throw new ApiError(
      500,
      providerError?.code ?? "RUBRIC_GENERATION_FAILED",
      clientMessage,
    );
  }
}
