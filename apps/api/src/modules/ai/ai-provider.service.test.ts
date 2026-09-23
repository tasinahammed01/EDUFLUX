import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AIProviderError, createAIProvider, parseJsonObject } from "./ai-provider.service.js";

const config = { provider: "openrouter" as const, apiKey: "openrouter-server-key-long-enough", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4.1-mini" };
const request = { task: "rubric" as const, systemPrompt: "system", userPrompt: "user", schema: z.object({ score: z.number() }) };
const response = (content: string, status = 200) => new Response(JSON.stringify(status === 200 ? { model: config.model, choices: [{ message: { content } }], usage: { total_tokens: 10 } } : { error: { code: content } }), { status });

describe("AI provider gateway", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("uses the configured OpenRouter base URL, key, and model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(JSON.stringify({ score: 9 })));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createAIProvider(config).generateStructured(request);
    expect(result.data.score).toBe(9);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("api.openai.com");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: expect.objectContaining({ Authorization: `Bearer ${config.apiKey}`, "X-Title": "EduFlux" }) });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ model: config.model });
  });

  it("parses plain, fenced, and safely embedded JSON objects", () => {
    expect(parseJsonObject('{"score":9}')).toEqual({ success: true, value: { score: 9 } });
    expect(parseJsonObject('```json\n{"score":9}\n```')).toEqual({ success: true, value: { score: 9 } });
    expect(parseJsonObject('Result:\n{"text":"a } brace","score":9}\nDone')).toEqual({ success: true, value: { text: "a } brace", score: 9 } });
  });

  it("repairs an invalid first response exactly once", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(JSON.stringify({ score: "high" }))).mockResolvedValueOnce(response(JSON.stringify({ score: 9 })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createAIProvider(config).generateStructured(request)).resolves.toMatchObject({ data: { score: 9 }, tokensUsed: 20 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const repairBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(repairBody.messages[1].content).toContain("score");
  });

  it("returns schema failure after one invalid repair", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(response(JSON.stringify({ score: "high" })))));
    await expect(createAIProvider(config).generateStructured(request)).rejects.toMatchObject({ code: "AI_RESPONSE_SCHEMA_FAILED", stage: "VALIDATION", issuePaths: ["score"] });
  });

  it("returns parse failure after one invalid repair", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(response("not json"))));
    await expect(createAIProvider(config).generateStructured(request)).rejects.toMatchObject({ code: "AI_RESPONSE_PARSE_FAILED", stage: "PARSE" });
  });

  it.each([[401, "AI_PROVIDER_AUTH_FAILED"], [429, "AI_PROVIDER_RATE_LIMITED"]] as const)("maps HTTP %s safely", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("safe_provider_code", status)));
    await expect(createAIProvider(config).generateStructured(request)).rejects.toMatchObject({ code, stage: "REQUEST", httpStatus: status, providerCode: "safe_provider_code" });
  });

  it("maps an aborted request to a safe timeout", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))));
    vi.useFakeTimers();
    const result = expect(createAIProvider(config).generateStructured(request)).rejects.toEqual(expect.objectContaining<Partial<AIProviderError>>({ code: "AI_PROVIDER_TIMEOUT", stage: "REQUEST" }));
    await vi.advanceTimersByTimeAsync(20_001);
    await result;
  });
});
