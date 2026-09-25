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
  evaluationPass?: "language" | "discourse";
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodSchema<T>;
  normalize?: (candidate: unknown) => unknown;
  temperature?: number;
  maxTokens?: number;
  repairMaxTokens?: number;
  truncationRetry?: {
    maxTokens: number;
    systemPromptSuffix: string;
  };
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AIProviderResponse<T> {
  data: T;
  model: string;
  tokensUsed: number;
}
export type AIProviderFailureStage = "REQUEST" | "PARSE" | "VALIDATION";
export type AIProviderFailureCode =
  | "AI_PROVIDER_NOT_CONFIGURED"
  | "AI_PROVIDER_AUTH_FAILED"
  | "AI_PROVIDER_RATE_LIMITED"
  | "AI_PROVIDER_TIMEOUT"
  | "AI_PROVIDER_REQUEST_FAILED"
  | "AI_RESPONSE_TRUNCATED"
  | "AI_RESPONSE_PARSE_FAILED"
  | "AI_RESPONSE_SCHEMA_FAILED";

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly stage: AIProviderFailureStage,
    public readonly code: AIProviderFailureCode,
    public readonly httpStatus?: number,
    public readonly providerCode?: string,
    public readonly issuePaths: string[] = [],
    public readonly evaluationPass?: "language" | "discourse",
    public readonly finishReason?: string,
    public readonly repairAttempted = false,
    public readonly timeout = false,
    public readonly requestStarted = true,
    public readonly abortReason?:
      | "pre_aborted_signal"
      | "request_timeout"
      | "caller_cancelled",
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export interface AIProvider {
  generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<AIProviderResponse<T>>;
}
const aiLogger = pino({ level: env.LOG_LEVEL });
type RawGeneration = {
  content: string;
  model: string;
  tokensUsed: number;
  finishReason?: string;
  durationMs: number;
};
type CandidateFailure = {
  stage: "PARSE" | "VALIDATION";
  candidate: unknown;
  issuePaths: string[];
  issueSummary: string[];
};

abstract class ChatCompletionsProvider implements AIProvider {
  abstract readonly providerName: "openai" | "openrouter";
  abstract readonly endpoint: string;
  abstract readonly extraHeaders: Record<string, string>;
  constructor(protected readonly config: AIProviderConfig) {}

  async generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<AIProviderResponse<T>> {
    const metadata = {
      task: request.task,
      provider: this.providerName,
      baseHost: new URL(this.endpoint).host,
      model: this.config.model,
      ...(request.evaluationPass
        ? { evaluationPass: request.evaluationPass }
        : {}),
    };
    aiLogger.debug(metadata, "[ai-provider] request");
    const first = await this.request(
      request.systemPrompt,
      request.userPrompt,
      request,
      "initial",
    );
    if (first.finishReason === "length") {
      aiLogger.warn(
        {
          ...metadata,
          httpStatus: 200,
          durationMs: first.durationMs,
          finishReason: first.finishReason,
          responseContentLength: first.content.length,
          repairAttempted: false,
          truncationRetryAttempted: Boolean(request.truncationRetry),
        },
        "[ai-provider] structured response truncated",
      );
      if (!request.truncationRetry) {
        throw new AIProviderError(
          "AI provider response was truncated",
          "PARSE",
          "AI_RESPONSE_TRUNCATED",
          200,
          undefined,
          ["$"],
          request.evaluationPass,
          first.finishReason,
        );
      }
      const { truncationRetry: _truncationRetry, ...retryRequest } = request;
      const retry = await this.request(
        `${request.systemPrompt}\n${request.truncationRetry.systemPromptSuffix}`,
        request.userPrompt,
        {
          ...retryRequest,
          maxTokens: request.truncationRetry.maxTokens,
        },
        "truncation_retry",
      );
      if (retry.finishReason === "length") {
        throw new AIProviderError(
          "AI provider response remained truncated after one retry",
          "PARSE",
          "AI_RESPONSE_TRUNCATED",
          200,
          undefined,
          ["$"],
          request.evaluationPass,
          retry.finishReason,
        );
      }
      const retryResult = validateCandidate(retry.content, request);
      if (!retryResult.success) {
        throw candidateError(
          retryResult.failure,
          request,
          retry.finishReason,
          false,
        );
      }
      aiLogger.info(
        {
          ...metadata,
          httpStatus: 200,
          durationMs: retry.durationMs,
          finishReason: retry.finishReason,
          responseContentLength: retry.content.length,
          repairAttempted: false,
          truncationRetryAttempted: true,
          truncationRetryResult: "accepted",
        },
        "[ai-provider] truncation retry accepted",
      );
      return {
        data: retryResult.data,
        model: retry.model,
        tokensUsed: first.tokensUsed + retry.tokensUsed,
      };
    }
    const firstResult = validateCandidate(first.content, request);
    if (firstResult.success) {
      aiLogger.info(
        {
          ...metadata,
          httpStatus: 200,
          durationMs: first.durationMs,
          finishReason: first.finishReason,
          responseContentLength: first.content.length,
          repairAttempted: false,
        },
        "[ai-provider] structured response accepted",
      );
      return {
        data: firstResult.data,
        model: first.model,
        tokensUsed: first.tokensUsed,
      };
    }

    aiLogger.warn(
      {
        ...metadata,
        httpStatus: 200,
        durationMs: first.durationMs,
        finishReason: first.finishReason,
        responseContentLength: first.content.length,
        parseStage: firstResult.failure.stage.toLowerCase(),
        issuePaths: firstResult.failure.issuePaths,
        repairAttempted: true,
      },
      "[ai-provider] structured response requires repair",
    );
    let repaired: RawGeneration;
    try {
      const { truncationRetry: _truncationRetry, ...repairRequest } = request;
      const repairMaxTokens = request.repairMaxTokens ?? request.maxTokens;
      repaired = await this.request(
        "Repair the supplied JSON so it satisfies every listed constraint. Return one JSON object only, without markdown or commentary.",
        buildRepairPrompt(firstResult.failure, request.schema, request.task),
        {
          ...repairRequest,
          temperature: 0,
          ...(repairMaxTokens === undefined
            ? {}
            : { maxTokens: repairMaxTokens }),
        },
        "repair",
      );
    } catch (error) {
      aiLogger.error(
        {
          ...metadata,
          repairAttempted: true,
          repairResult: "request_failed",
          timeout:
            error instanceof AIProviderError &&
            error.code === "AI_PROVIDER_TIMEOUT",
          ...(error instanceof AIProviderError
            ? {
                code: error.code,
                ...(error.httpStatus ? { httpStatus: error.httpStatus } : {}),
              }
            : { code: "AI_PROVIDER_REQUEST_FAILED" }),
        },
        "[ai-provider] structured response repair failed",
      );
      if (error instanceof AIProviderError) {
        throw new AIProviderError(
          error.message,
          error.stage,
          error.code,
          error.httpStatus,
          error.providerCode,
          error.issuePaths,
          request.evaluationPass,
          first.finishReason,
          true,
          error.timeout,
          error.requestStarted,
          error.abortReason,
        );
      }
      throw error;
    }
    if (repaired.finishReason === "length") {
      throw new AIProviderError(
        "AI provider repair response was truncated",
        "PARSE",
        "AI_RESPONSE_TRUNCATED",
        200,
        undefined,
        ["$"],
        request.evaluationPass,
        repaired.finishReason,
        true,
      );
    }
    const repairedResult = validateCandidate(repaired.content, request);
    if (!repairedResult.success) {
      aiLogger.error(
        {
          ...metadata,
          httpStatus: 200,
          durationMs: repaired.durationMs,
          finishReason: repaired.finishReason,
          responseContentLength: repaired.content.length,
          parseStage: repairedResult.failure.stage.toLowerCase(),
          issuePaths: repairedResult.failure.issuePaths,
          repairAttempted: true,
          repairResult: "invalid",
          timeout: false,
        },
        "[ai-provider] repaired response remained invalid",
      );
      throw new AIProviderError(
        repairedResult.failure.stage === "PARSE"
          ? "AI provider response could not be parsed"
          : "AI provider response did not match the required schema",
        repairedResult.failure.stage,
        repairedResult.failure.stage === "PARSE"
          ? "AI_RESPONSE_PARSE_FAILED"
          : "AI_RESPONSE_SCHEMA_FAILED",
        undefined,
        undefined,
        repairedResult.failure.issuePaths,
        request.evaluationPass,
        repaired.finishReason,
        true,
      );
    }
    aiLogger.info(
      {
        ...metadata,
        httpStatus: 200,
        durationMs: repaired.durationMs,
        finishReason: repaired.finishReason,
        responseContentLength: repaired.content.length,
        repairAttempted: true,
        repairResult: "accepted",
        timeout: false,
      },
      "[ai-provider] structured response repair accepted",
    );
    return {
      data: repairedResult.data,
      model: repaired.model,
      tokensUsed: first.tokensUsed + repaired.tokensUsed,
    };
  }

  private async request<T>(
    systemPrompt: string,
    userPrompt: string,
    request: StructuredGenerationRequest<T>,
    phase: "initial" | "repair" | "truncation_retry",
  ): Promise<RawGeneration> {
    if (request.signal?.aborted) {
      aiLogger.error(
        {
          task: request.task,
          provider: this.providerName,
          model: this.config.model,
          ...(request.evaluationPass
            ? { evaluationPass: request.evaluationPass }
            : {}),
          requestPhase: phase,
          requestStarted: false,
          timeout: false,
          abortReason: "pre_aborted_signal",
          errorClass: "AbortError",
        },
        "[ai-provider] request not started",
      );
      throw new AIProviderError(
        "AI provider request was already cancelled",
        "REQUEST",
        "AI_PROVIDER_TIMEOUT",
        undefined,
        undefined,
        [],
        request.evaluationPass,
        undefined,
        phase === "repair",
        false,
        false,
        "pre_aborted_signal",
      );
    }
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    request.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeoutMs = request.timeoutMs ?? env.AI_REQUEST_TIMEOUT_MS;
    const startedAt = Date.now();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
          ...this.extraHeaders,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 2000,
          response_format: { type: "json_object" },
        }),
      });
    } catch (error) {
      const callerCancelled = Boolean(request.signal?.aborted);
      const didAbort =
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError");
      const didTimeout = didAbort && !callerCancelled;
      aiLogger.error(
        {
          task: request.task,
          provider: this.providerName,
          model: this.config.model,
          ...(request.evaluationPass
            ? { evaluationPass: request.evaluationPass }
            : {}),
          requestPhase: phase,
          requestStarted: true,
          durationMs: Date.now() - startedAt,
          timeout: didTimeout,
          abortReason: callerCancelled
            ? "caller_cancelled"
            : didTimeout
              ? "request_timeout"
              : undefined,
          errorClass:
            error instanceof Error ? error.constructor.name : "UnknownError",
          repairAttempted: phase === "repair",
        },
        "[ai-provider] request failed",
      );
      if (didAbort)
        throw new AIProviderError(
          callerCancelled
            ? "AI provider request was cancelled"
            : "AI provider timed out",
          "REQUEST",
          "AI_PROVIDER_TIMEOUT",
          undefined,
          undefined,
          [],
          request.evaluationPass,
          undefined,
          phase === "repair",
          didTimeout,
          true,
          callerCancelled ? "caller_cancelled" : "request_timeout",
        );
      throw new AIProviderError(
        "AI provider request failed",
        "REQUEST",
        "AI_PROVIDER_REQUEST_FAILED",
        undefined,
        undefined,
        [],
        request.evaluationPass,
        undefined,
        phase === "repair",
      );
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", abortFromCaller);
    }

    if (!response.ok) {
      const providerCode = await readProviderCode(response);
      const code: AIProviderFailureCode =
        response.status === 401 || response.status === 403
          ? "AI_PROVIDER_AUTH_FAILED"
          : response.status === 429
            ? "AI_PROVIDER_RATE_LIMITED"
            : "AI_PROVIDER_REQUEST_FAILED";
      aiLogger.error(
        {
          task: request.task,
          provider: this.providerName,
          model: this.config.model,
          ...(request.evaluationPass
            ? { evaluationPass: request.evaluationPass }
            : {}),
          requestPhase: phase,
          requestStarted: true,
          httpStatus: response.status,
          durationMs: Date.now() - startedAt,
          timeout: false,
          errorClass: "HTTPError",
          repairAttempted: phase === "repair",
        },
        "[ai-provider] request rejected",
      );
      throw new AIProviderError(
        `AI provider returned status ${response.status}`,
        "REQUEST",
        code,
        response.status,
        providerCode,
        [],
        request.evaluationPass,
        undefined,
        phase === "repair",
      );
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > 1_000_000)
      throw new AIProviderError(
        "AI provider response was too large",
        "PARSE",
        "AI_RESPONSE_PARSE_FAILED",
        undefined,
        undefined,
        [],
        request.evaluationPass,
        undefined,
        phase === "repair",
      );
    const raw = await response.text();
    if (raw.length > 1_000_000)
      throw new AIProviderError(
        "AI provider response was too large",
        "PARSE",
        "AI_RESPONSE_PARSE_FAILED",
        undefined,
        undefined,
        [],
        request.evaluationPass,
        undefined,
        phase === "repair",
      );
    let body: {
      model?: unknown;
      choices?: Array<{
        message?: { content?: unknown };
        finish_reason?: unknown;
      }>;
      usage?: { total_tokens?: unknown };
    };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch (error) {
      aiLogger.error(
        {
          task: request.task,
          provider: this.providerName,
          model: this.config.model,
          ...(request.evaluationPass
            ? { evaluationPass: request.evaluationPass }
            : {}),
          requestPhase: phase,
          requestStarted: true,
          httpStatus: response.status,
          durationMs: Date.now() - startedAt,
          timeout: false,
          errorClass:
            error instanceof Error ? error.constructor.name : "SyntaxError",
          responseContentLength: raw.length,
          repairAttempted: phase === "repair",
        },
        "[ai-provider] invalid response envelope",
      );
      throw new AIProviderError(
        "AI provider returned invalid envelope JSON",
        "PARSE",
        "AI_RESPONSE_PARSE_FAILED",
        undefined,
        undefined,
        [],
        request.evaluationPass,
        undefined,
        phase === "repair",
      );
    }
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string")
      throw new AIProviderError(
        "AI provider response was incomplete",
        "PARSE",
        "AI_RESPONSE_PARSE_FAILED",
        undefined,
        undefined,
        [],
        request.evaluationPass,
        undefined,
        phase === "repair",
      );
    const finishReason = body.choices?.[0]?.finish_reason;
    const durationMs = Date.now() - startedAt;
    aiLogger.info(
      {
        task: request.task,
        provider: this.providerName,
        model: this.config.model,
        ...(request.evaluationPass
          ? { evaluationPass: request.evaluationPass }
          : {}),
        requestPhase: phase,
        requestStarted: true,
        httpStatus: response.status,
        durationMs,
        timeout: false,
        ...(typeof finishReason === "string" ? { finishReason } : {}),
        responseContentLength: content.length,
        repairAttempted: phase === "repair",
      },
      "[ai-provider] physical request completed",
    );
    return {
      content,
      model: typeof body.model === "string" ? body.model : this.config.model,
      tokensUsed:
        typeof body.usage?.total_tokens === "number"
          ? body.usage.total_tokens
          : 0,
      ...(typeof finishReason === "string" ? { finishReason } : {}),
      durationMs,
    };
  }
}

class OpenRouterProvider extends ChatCompletionsProvider {
  readonly providerName = "openrouter" as const;
  readonly endpoint: string;
  readonly extraHeaders = {
    "HTTP-Referer": env.WEB_ORIGIN,
    "X-Title": "EduFlux",
  };
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

function validateCandidate<T>(
  content: string,
  request: StructuredGenerationRequest<T>,
): { success: true; data: T } | { success: false; failure: CandidateFailure } {
  const parsed = parseJsonObject(content);
  if (!parsed.success)
    return {
      success: false,
      failure: {
        stage: "PARSE",
        candidate: content.slice(0, 50_000),
        issuePaths: ["$"],
        issueSummary: ["$: invalid JSON object"],
      },
    };
  const candidate = request.normalize
    ? request.normalize(parsed.value)
    : parsed.value;
  const validation = request.schema.safeParse(candidate);
  if (validation.success) return { success: true, data: validation.data };
  const issues = validation.error.issues.slice(0, 30);
  return {
    success: false,
    failure: {
      stage: "VALIDATION",
      candidate,
      issuePaths: [
        ...new Set(
          issues.map((issue) =>
            issue.path.length ? issue.path.join(".") : "$",
          ),
        ),
      ],
      issueSummary: issues.map(
        (issue) =>
          `${issue.path.length ? issue.path.join(".") : "$"}: ${issue.message}`,
      ),
    },
  };
}

function candidateError<T>(
  failure: CandidateFailure,
  request: StructuredGenerationRequest<T>,
  finishReason: string | undefined,
  repairAttempted: boolean,
) {
  return new AIProviderError(
    failure.stage === "PARSE"
      ? "AI provider response could not be parsed"
      : "AI provider response did not match the required schema",
    failure.stage,
    failure.stage === "PARSE"
      ? "AI_RESPONSE_PARSE_FAILED"
      : "AI_RESPONSE_SCHEMA_FAILED",
    200,
    undefined,
    failure.issuePaths,
    request.evaluationPass,
    finishReason,
    repairAttempted,
  );
}

export function parseJsonObject(
  content: string,
): { success: true; value: unknown } | { success: false } {
  const trimmed = content.trim();
  const direct = tryParseObject(trimmed);
  if (direct.success) return direct;
  if (trimmed.startsWith("```")) {
    const firstNewline = trimmed.indexOf("\n");
    const lastFence = trimmed.lastIndexOf("```");
    if (firstNewline >= 0 && lastFence > firstNewline) {
      const fenced = tryParseObject(
        trimmed.slice(firstNewline + 1, lastFence).trim(),
      );
      if (fenced.success) return fenced;
    }
  }
  const extracted = extractFirstJsonObject(trimmed);
  return extracted === undefined
    ? { success: false }
    : tryParseObject(extracted);
}

function tryParseObject(
  value: string,
): { success: true; value: unknown } | { success: false } {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? { success: true, value: parsed }
      : { success: false };
  } catch {
    return { success: false };
  }
}

function extractFirstJsonObject(value: string): string | undefined {
  const start = value.indexOf("{");
  if (start < 0) return undefined;
  let depth = 0,
    inString = false,
    escaped = false;
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
    else if (character === "}" && --depth === 0)
      return value.slice(start, index + 1);
  }
  return undefined;
}

function buildRepairPrompt(
  failure: CandidateFailure,
  schema: z.ZodType,
  task: StructuredGenerationRequest<unknown>["task"],
): string {
  const constraints = [
    "Return exactly one JSON object.",
    "Preserve intended educational content while correcting only structural and validation problems.",
    "All required fields must be present and numeric fields must be JSON numbers.",
  ];
  if (task === "rubric")
    constraints.push(
      "Criterion weights must total exactly 100 and every criterion must have exactly one descriptor per level.",
    );
  return JSON.stringify({
    candidate: failure.candidate,
    validationIssues: failure.issueSummary,
    expectedSchema: z.toJSONSchema(schema),
    constraints,
  });
}

async function readProviderCode(
  response: Response,
): Promise<string | undefined> {
  try {
    const raw = await response.text();
    if (raw.length > 100_000) return undefined;
    const body = JSON.parse(raw) as { error?: { code?: unknown } };
    return typeof body.error?.code === "string"
      ? body.error.code.slice(0, 100)
      : undefined;
  } catch {
    return undefined;
  }
}

export function createAIProvider(config: AIProviderConfig): AIProvider {
  if (config.provider === "openrouter") return new OpenRouterProvider(config);
  if (config.provider === "openai") return new OpenAIProvider(config);
  throw new AIProviderError(
    "Configured AI provider is not implemented",
    "REQUEST",
    "AI_PROVIDER_NOT_CONFIGURED",
  );
}

export function getAIProviderConfig(
  model = env.AI_RUBRIC_MODEL,
): AIProviderConfig {
  if (env.AI_PROVIDER === "openrouter") {
    if (!env.OPENROUTER_API_KEY)
      throw new AIProviderError(
        "OpenRouter is not configured",
        "REQUEST",
        "AI_PROVIDER_NOT_CONFIGURED",
      );
    return {
      provider: "openrouter",
      apiKey: env.OPENROUTER_API_KEY,
      baseUrl: env.OPENROUTER_BASE_URL,
      model,
    };
  }
  if (env.AI_PROVIDER === "openai") {
    if (!env.AI_API_KEY)
      throw new AIProviderError(
        "OpenAI is not configured",
        "REQUEST",
        "AI_PROVIDER_NOT_CONFIGURED",
      );
    return { provider: "openai", apiKey: env.AI_API_KEY, model };
  }
  throw new AIProviderError(
    "Configured AI provider is not implemented",
    "REQUEST",
    "AI_PROVIDER_NOT_CONFIGURED",
  );
}
