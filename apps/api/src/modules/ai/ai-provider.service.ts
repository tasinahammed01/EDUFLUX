import pino from "pino";
import { z } from "zod";
import { env } from "../../config/env.js";

export interface AIProviderConfig {
  provider: "openai" | "openrouter" | "gemini";
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface StructuredGenerationRequest<T> {
  task: "rubric" | "evaluation";
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodSchema<T>;
  normalize?: (candidate: unknown) => unknown;
  temperature?: number;
  maxTokens?: number;
}

export interface AIProviderResponse<T> { data: T; model: string; tokensUsed: number; }
export type AIProviderFailureStage = "REQUEST" | "PARSE" | "VALIDATION";
export type AIProviderFailureCode = "AI_PROVIDER_NOT_CONFIGURED" | "AI_PROVIDER_AUTH_FAILED" | "AI_PROVIDER_RATE_LIMITED" | "AI_PROVIDER_TIMEOUT" | "AI_PROVIDER_REQUEST_FAILED" | "AI_RESPONSE_PARSE_FAILED" | "AI_RESPONSE_SCHEMA_FAILED";

export class AIProviderError extends Error {
  constructor(message: string, public readonly stage: AIProviderFailureStage, public readonly code: AIProviderFailureCode, public readonly httpStatus?: number, public readonly providerCode?: string, public readonly issuePaths: string[] = []) {
    super(message);
    this.name = "AIProviderError";
  }
}

export interface AIProvider { generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<AIProviderResponse<T>>; }
const aiLogger = pino({ level: env.LOG_LEVEL });
type RawGeneration = { content: string; model: string; tokensUsed: number };
type CandidateFailure = { stage: "PARSE" | "VALIDATION"; candidate: unknown; issuePaths: string[]; issueSummary: string[] };

abstract class ChatCompletionsProvider implements AIProvider {
  abstract readonly providerName: "openai" | "openrouter";
  abstract readonly endpoint: string;
  abstract readonly extraHeaders: Record<string, string>;
  constructor(protected readonly config: AIProviderConfig) {}

  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<AIProviderResponse<T>> {
    aiLogger.debug({ task: request.task, provider: this.providerName, baseHost: new URL(this.endpoint).host, model: this.config.model }, "[ai-provider] request");
    const first = await this.request(request.systemPrompt, request.userPrompt, request);
    const firstResult = validateCandidate(first.content, request);
    if (firstResult.success) return { data: firstResult.data, model: first.model, tokensUsed: first.tokensUsed };

    aiLogger.warn({ task: request.task, provider: this.providerName, model: this.config.model, stage: firstResult.failure.stage.toLowerCase(), issuePaths: firstResult.failure.issuePaths }, "[ai-provider] structured response requires repair");
    const repaired = await this.request(
      "Repair the supplied JSON so it satisfies every listed constraint. Return one JSON object only, without markdown or commentary.",
      buildRepairPrompt(firstResult.failure, request.schema),
      { ...request, temperature: 0 },
    );
    const repairedResult = validateCandidate(repaired.content, request);
    if (!repairedResult.success) {
      throw new AIProviderError(
        repairedResult.failure.stage === "PARSE" ? "AI provider response could not be parsed" : "AI provider response did not match the required schema",
        repairedResult.failure.stage,
        repairedResult.failure.stage === "PARSE" ? "AI_RESPONSE_PARSE_FAILED" : "AI_RESPONSE_SCHEMA_FAILED",
        undefined,
        undefined,
        repairedResult.failure.issuePaths,
      );
    }
    return { data: repairedResult.data, model: repaired.model, tokensUsed: first.tokensUsed + repaired.tokensUsed };
  }

  private async request<T>(systemPrompt: string, userPrompt: string, request: StructuredGenerationRequest<T>): Promise<RawGeneration> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.AI_REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}`, ...this.extraHeaders },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 2000,
          response_format: { type: "json_object" },
        }),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new AIProviderError("AI provider timed out", "REQUEST", "AI_PROVIDER_TIMEOUT");
      throw new AIProviderError("AI provider request failed", "REQUEST", "AI_PROVIDER_REQUEST_FAILED");
    } finally { clearTimeout(timeout); }

    if (!response.ok) {
      const providerCode = await readProviderCode(response);
      const code: AIProviderFailureCode = response.status === 401 || response.status === 403 ? "AI_PROVIDER_AUTH_FAILED" : response.status === 429 ? "AI_PROVIDER_RATE_LIMITED" : "AI_PROVIDER_REQUEST_FAILED";
      throw new AIProviderError(`AI provider returned status ${response.status}`, "REQUEST", code, response.status, providerCode);
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > 1_000_000) throw new AIProviderError("AI provider response was too large", "PARSE", "AI_RESPONSE_PARSE_FAILED");
    const raw = await response.text();
    if (raw.length > 1_000_000) throw new AIProviderError("AI provider response was too large", "PARSE", "AI_RESPONSE_PARSE_FAILED");
    let body: { model?: unknown; choices?: Array<{ message?: { content?: unknown } }>; usage?: { total_tokens?: unknown } };
    try { body = JSON.parse(raw) as typeof body; }
    catch { throw new AIProviderError("AI provider returned invalid envelope JSON", "PARSE", "AI_RESPONSE_PARSE_FAILED"); }
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new AIProviderError("AI provider response was incomplete", "PARSE", "AI_RESPONSE_PARSE_FAILED");
    return { content, model: typeof body.model === "string" ? body.model : this.config.model, tokensUsed: typeof body.usage?.total_tokens === "number" ? body.usage.total_tokens : 0 };
  }
}

class OpenRouterProvider extends ChatCompletionsProvider {
  readonly providerName = "openrouter" as const;
  readonly endpoint: string;
  readonly extraHeaders = { "HTTP-Referer": env.WEB_ORIGIN, "X-Title": "EduFlux" };
  constructor(config: AIProviderConfig) {
    super(config);
    this.endpoint = `${(config.baseUrl ?? env.OPENROUTER_BASE_URL).replace(/\/$/, "")}/chat/completions`;
  }
}

class OpenAIProvider extends ChatCompletionsProvider {
  readonly providerName = "openai" as const;
  readonly endpoint = "https://api.openai.com/v1/chat/completions";
  readonly extraHeaders = {};
}

function validateCandidate<T>(content: string, request: StructuredGenerationRequest<T>): { success: true; data: T } | { success: false; failure: CandidateFailure } {
  const parsed = parseJsonObject(content);
  if (!parsed.success) return { success: false, failure: { stage: "PARSE", candidate: content.slice(0, 50_000), issuePaths: ["$"], issueSummary: ["$: invalid JSON object"] } };
  const candidate = request.normalize ? request.normalize(parsed.value) : parsed.value;
  const validation = request.schema.safeParse(candidate);
  if (validation.success) return { success: true, data: validation.data };
  const issues = validation.error.issues.slice(0, 30);
  return { success: false, failure: { stage: "VALIDATION", candidate, issuePaths: [...new Set(issues.map((issue) => issue.path.length ? issue.path.join(".") : "$"))], issueSummary: issues.map((issue) => `${issue.path.length ? issue.path.join(".") : "$"}: ${issue.message}`) } };
}

export function parseJsonObject(content: string): { success: true; value: unknown } | { success: false } {
  const trimmed = content.trim();
  const direct = tryParseObject(trimmed);
  if (direct.success) return direct;
  if (trimmed.startsWith("```")) {
    const firstNewline = trimmed.indexOf("\n");
    const lastFence = trimmed.lastIndexOf("```");
    if (firstNewline >= 0 && lastFence > firstNewline) {
      const fenced = tryParseObject(trimmed.slice(firstNewline + 1, lastFence).trim());
      if (fenced.success) return fenced;
    }
  }
  const extracted = extractFirstJsonObject(trimmed);
  return extracted === undefined ? { success: false } : tryParseObject(extracted);
}

function tryParseObject(value: string): { success: true; value: unknown } | { success: false } {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? { success: true, value: parsed } : { success: false };
  } catch { return { success: false }; }
}

function extractFirstJsonObject(value: string): string | undefined {
  const start = value.indexOf("{");
  if (start < 0) return undefined;
  let depth = 0, inString = false, escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return value.slice(start, index + 1);
  }
  return undefined;
}

function buildRepairPrompt(failure: CandidateFailure, schema: z.ZodType): string {
  return JSON.stringify({ candidate: failure.candidate, validationIssues: failure.issueSummary, expectedSchema: z.toJSONSchema(schema), constraints: ["Return exactly one JSON object.", "Preserve intended educational content while correcting only structural and validation problems.", "All required fields must be present and numeric fields must be JSON numbers.", "Criterion weights must total exactly 100 and every criterion must have exactly one descriptor per level."] });
}

async function readProviderCode(response: Response): Promise<string | undefined> {
  try {
    const raw = await response.text();
    if (raw.length > 100_000) return undefined;
    const body = JSON.parse(raw) as { error?: { code?: unknown } };
    return typeof body.error?.code === "string" ? body.error.code.slice(0, 100) : undefined;
  } catch { return undefined; }
}

export function createAIProvider(config: AIProviderConfig): AIProvider {
  if (config.provider === "openrouter") return new OpenRouterProvider(config);
  if (config.provider === "openai") return new OpenAIProvider(config);
  throw new AIProviderError("Configured AI provider is not implemented", "REQUEST", "AI_PROVIDER_NOT_CONFIGURED");
}

export function getAIProviderConfig(model = env.AI_RUBRIC_MODEL): AIProviderConfig {
  if (env.AI_PROVIDER === "openrouter") {
    if (!env.OPENROUTER_API_KEY) throw new AIProviderError("OpenRouter is not configured", "REQUEST", "AI_PROVIDER_NOT_CONFIGURED");
    return { provider: "openrouter", apiKey: env.OPENROUTER_API_KEY, baseUrl: env.OPENROUTER_BASE_URL, model };
  }
  if (env.AI_PROVIDER === "openai") {
    if (!env.AI_API_KEY) throw new AIProviderError("OpenAI is not configured", "REQUEST", "AI_PROVIDER_NOT_CONFIGURED");
    return { provider: "openai", apiKey: env.AI_API_KEY, model };
  }
  throw new AIProviderError("Configured AI provider is not implemented", "REQUEST", "AI_PROVIDER_NOT_CONFIGURED");
}
