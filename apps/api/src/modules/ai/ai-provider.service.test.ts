import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AIProviderError,
  createAIProvider,
  parseJsonObject,
} from "./ai-provider.service.js";
import { discourseEvaluationWireSchema } from "../submissions/evaluation.service.js";

const config = {
  provider: "openrouter" as const,
  apiKey: "openrouter-server-key-long-enough",
  baseUrl: "https://openrouter.ai/api/v1",
  model: "openai/gpt-4.1-mini",
};
const request = {
  task: "rubric" as const,
  systemPrompt: "system",
  userPrompt: "user",
  schema: z.object({ score: z.number() }),
};
const response = (content: string, status = 200, finishReason = "stop") =>
  new Response(
    JSON.stringify(
      status === 200
        ? {
            model: config.model,
            choices: [{ message: { content }, finish_reason: finishReason }],
            usage: { total_tokens: 10 },
          }
        : { error: { code: content } },
    ),
    { status },
  );

describe("AI provider gateway", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("uses the configured OpenRouter base URL, key, and model", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response(JSON.stringify({ score: 9 })));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createAIProvider(config).generateStructured(request);
    expect(result.data.score).toBe(9);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("api.openai.com");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: `Bearer ${config.apiKey}`,
        "X-Title": "EduFlux",
      }),
    });
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({ model: config.model });
  });

  it("parses plain, fenced, and safely embedded JSON objects", () => {
    expect(parseJsonObject('{"score":9}')).toEqual({
      success: true,
      value: { score: 9 },
    });
    expect(parseJsonObject('```json\n{"score":9}\n```')).toEqual({
      success: true,
      value: { score: 9 },
    });
    expect(
      parseJsonObject('Result:\n{"text":"a } brace","score":9}\nDone'),
    ).toEqual({ success: true, value: { text: "a } brace", score: 9 } });
  });

  it("repairs an invalid first response exactly once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(JSON.stringify({ score: "high" })))
      .mockResolvedValueOnce(response(JSON.stringify({ score: 9 })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createAIProvider(config).generateStructured(request),
    ).resolves.toMatchObject({ data: { score: 9 }, tokensUsed: 20 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const repairBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(repairBody.messages[1].content).toContain("score");
  });

  it("accepts bounded overlong discourse evidence without a repair request", async () => {
    const candidate = {
      overallScore: 8,
      maxScore: 10,
      issues: [{
        id: "development",
        code: "DEV",
        originalText: "evidence ".repeat(50),
        suggestedText: "replacement ".repeat(40),
        explanation: "explanation ".repeat(35),
      }],
      strengths: [],
      feedbackSections: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(response(JSON.stringify(candidate)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createAIProvider(config).generateStructured({
        ...request,
        task: "evaluation",
        evaluationPass: "discourse",
        schema: discourseEvaluationWireSchema,
      }),
    ).resolves.toMatchObject({ data: { issues: [{ code: "DEV" }] } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(["language", "discourse"] as const)(
    "repairs malformed %s-pass JSON independently",
    async (evaluationPass) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(response('{"score":', 200, "stop"))
        .mockResolvedValueOnce(response('{"score":9}'));
      vi.stubGlobal("fetch", fetchMock);
      await expect(
        createAIProvider(config).generateStructured({
          ...request,
          task: "evaluation",
          evaluationPass,
        }),
      ).resolves.toMatchObject({ data: { score: 9 } });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("regenerates a truncated discourse response once without generic repair", async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn((_url, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      return Promise.resolve(
        signals.length === 1
          ? response('{"score":', 200, "length")
          : response('{"score":9}', 200, "stop"),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createAIProvider(config).generateStructured({
        ...request,
        task: "evaluation",
        evaluationPass: "discourse",
        truncationRetry: {
          maxTokens: 7_000,
          systemPromptSuffix: "Regenerate concisely.",
        },
      }),
    ).resolves.toMatchObject({ data: { score: 9 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signals[0]).not.toBe(signals[1]);
    const retryBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(retryBody.max_tokens).toBe(7_000);
    expect(retryBody.messages[0].content).toContain("Regenerate concisely.");
    expect(retryBody.messages[1].content).toBe("user");
  });

  it("classifies a second truncation and never retries indefinitely", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(response('{"score":', 200, "length")),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createAIProvider(config).generateStructured({
        ...request,
        task: "evaluation",
        evaluationPass: "discourse",
        truncationRetry: {
          maxTokens: 7_000,
          systemPromptSuffix: "Regenerate concisely.",
        },
      }),
    ).rejects.toMatchObject({
      code: "AI_RESPONSE_TRUNCATED",
      evaluationPass: "discourse",
      finishReason: "length",
      repairAttempted: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives normal repair a fresh signal and timeout lifecycle", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn((_url, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      return new Promise<Response>((resolve) => {
        setTimeout(
          () =>
            resolve(
              signals.length === 1
                ? response("not json")
                : response('{"score":9}'),
            ),
          signals.length === 1 ? 900 : 200,
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const generated = createAIProvider(config).generateStructured({
      ...request,
      timeoutMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(900);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signals[0]).not.toBe(signals[1]);
    expect(signals[1]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    await expect(generated).resolves.toMatchObject({ data: { score: 9 } });
  });

  it("rejects a pre-aborted signal before fetch starts", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createAIProvider(config).generateStructured({
        ...request,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: "AI_PROVIDER_TIMEOUT",
      requestStarted: false,
      abortReason: "pre_aborted_signal",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a failed repair request without hiding its pass or HTTP status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response("not json"))
      .mockResolvedValueOnce(response("upstream_error", 503));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createAIProvider(config).generateStructured({
        ...request,
        task: "evaluation",
        evaluationPass: "language",
      }),
    ).rejects.toMatchObject({
      code: "AI_PROVIDER_REQUEST_FAILED",
      stage: "REQUEST",
      httpStatus: 503,
      evaluationPass: "language",
      repairAttempted: true,
    });
  });

  it("returns schema failure after one invalid repair", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(response(JSON.stringify({ score: "high" }))),
        ),
    );
    await expect(
      createAIProvider(config).generateStructured(request),
    ).rejects.toMatchObject({
      code: "AI_RESPONSE_SCHEMA_FAILED",
      stage: "VALIDATION",
      issuePaths: ["score"],
    });
  });

  it("returns parse failure after one invalid repair", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(response("not json"))),
    );
    await expect(
      createAIProvider(config).generateStructured(request),
    ).rejects.toMatchObject({
      code: "AI_RESPONSE_PARSE_FAILED",
      stage: "PARSE",
    });
  });

  it.each([
    [401, "AI_PROVIDER_AUTH_FAILED"],
    [429, "AI_PROVIDER_RATE_LIMITED"],
  ] as const)("maps HTTP %s safely", async (status, code) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response("safe_provider_code", status)),
    );
    await expect(
      createAIProvider(config).generateStructured(request),
    ).rejects.toMatchObject({
      code,
      stage: "REQUEST",
      httpStatus: status,
      providerCode: "safe_provider_code",
    });
  });

  it("maps an aborted request to a safe timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            ),
          ),
      ),
    );
    vi.useFakeTimers();
    const result = expect(
      createAIProvider(config).generateStructured({
        ...request,
        task: "evaluation",
        evaluationPass: "discourse",
        timeoutMs: 1_000,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AIProviderError>>({
        code: "AI_PROVIDER_TIMEOUT",
        stage: "REQUEST",
        evaluationPass: "discourse",
        timeout: true,
      }),
    );
    await vi.advanceTimersByTimeAsync(1_001);
    await result;
  });
});
