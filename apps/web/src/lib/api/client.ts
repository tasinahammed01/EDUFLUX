import type { ApiResponse } from "@eduflux/shared-types";

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

let csrfToken: string | undefined;
const timeoutMs = 12_000;

async function request<T>(
  path: string,
  init: RequestInit = {},
  retryCsrf = true,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const method = init.method?.toUpperCase() ?? "GET";
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);
    if (mutation && !csrfToken) csrfToken = await getCsrfToken();
    const response = await fetch(`/api/v1${path}`, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(mutation && csrfToken ? { "x-csrf-token": csrfToken } : {}),
        ...init.headers,
      },
    });
    const body = (await response.json()) as ApiResponse<T>;
    if (!response.ok || body.error) {
      if (body.error?.code === "CSRF_INVALID" && mutation && retryCsrf) {
        csrfToken = undefined;
        return request<T>(path, init, false);
      }
      throw new ApiClientError(
        body.error?.code ?? "REQUEST_FAILED",
        body.error?.message ?? "Request failed.",
        response.status,
        body.error?.fields,
      );
    }
    return body.data;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    if (error instanceof DOMException && error.name === "AbortError")
      throw new ApiClientError(
        "TIMEOUT",
        "The request took too long. Please try again.",
        408,
      );
    throw new ApiClientError(
      "NETWORK_ERROR",
      "We could not reach MENTRA. Check your connection and try again.",
      0,
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

async function getCsrfToken(): Promise<string> {
  const response = await fetch("/api/v1/auth/csrf", {
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = (await response.json()) as ApiResponse<{ csrfToken: string }>;
  if (!response.ok || body.error)
    throw new ApiClientError(
      "CSRF_UNAVAILABLE",
      "Could not start a secure request. Please refresh.",
      response.status,
    );
  return body.data.csrfToken;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
