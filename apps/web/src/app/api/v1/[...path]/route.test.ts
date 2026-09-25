import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD } from "./route";
import { NextRequest } from "next/server";

// Mock fetch to control upstream responses
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe("API Proxy Route Handler", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    vi.stubEnv("API_INTERNAL_URL", "https://eduflux-api.vercel.app");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("A. GET forwards path correctly", () => {
    it("should forward GET request with correct path", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: { success: true } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session");
      const response = await GET(request, { params: Promise.resolve({ path: ["auth", "session"] }) } as any);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://eduflux-api.vercel.app/api/v1/auth/session",
        expect.objectContaining({
          method: "GET",
          cache: "no-store",
        })
      );
      expect(response.status).toBe(200);
    });
  });

  describe("B. Query string preserved", () => {
    it("should preserve query parameters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: { classes: [] } }),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/v1/classes?page=2&limit=20"
      );
      await GET(request, { params: Promise.resolve({ path: ["classes"] }) } as any);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://eduflux-api.vercel.app/api/v1/classes?page=2&limit=20",
        expect.any(Object)
      );
    });
  });

  describe("C. POST body forwarded", () => {
    it("should forward POST request body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: { token: "abc123" } }),
      });

      const body = JSON.stringify({ email: "test@example.com", password: "secret" });
      const request = new NextRequest("http://localhost:3000/api/v1/auth/session-login", {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
      });

      await POST(request, { params: Promise.resolve({ path: ["auth", "session-login"] }) } as any);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://eduflux-api.vercel.app/api/v1/auth/session-login",
        expect.objectContaining({
          method: "POST",
          body,
        })
      );
    });
  });

  describe("D. PUT body forwarded", () => {
    it("should forward PUT request body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: { updated: true } }),
      });

      const body = JSON.stringify({ name: "Updated Class" });
      const request = new NextRequest(
        "http://localhost:3000/api/v1/classes/123/rubric",
        {
          method: "PUT",
          body,
          headers: { "content-type": "application/json" },
        }
      );

      await PUT(request, {
        params: Promise.resolve({ path: ["classes", "123", "rubric"] }),
      } as any);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://eduflux-api.vercel.app/api/v1/classes/123/rubric",
        expect.objectContaining({
          method: "PUT",
          body,
        })
      );
    });
  });

  describe("E. PATCH body forwarded", () => {
    it("should forward PATCH request body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: { updated: true } }),
      });

      const body = JSON.stringify({ typedText: "New content" });
      const request = new NextRequest(
        "http://localhost:3000/api/v1/classes/123/assignments/456/submission/draft",
        {
          method: "PATCH",
          body,
          headers: { "content-type": "application/json" },
        }
      );

      await PATCH(request, {
        params: Promise.resolve({ path: ["classes", "123", "assignments", "456", "submission", "draft"] }),
      } as any);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://eduflux-api.vercel.app/api/v1/classes/123/assignments/456/submission/draft",
        expect.objectContaining({
          method: "PATCH",
          body,
        })
      );
    });
  });

  describe("F. DELETE supported", () => {
    it("should handle DELETE requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: { deleted: true } }),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/v1/submission-files/file123",
        { method: "DELETE" }
      );

      await DELETE(request, { params: Promise.resolve({ path: ["submission-files", "file123"] }) } as any);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://eduflux-api.vercel.app/api/v1/submission-files/file123",
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });
  });

  describe("G. CSRF header forwarded", () => {
    it("should forward x-csrf-token header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: { success: true } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session-login", {
        method: "POST",
        body: "{}",
        headers: { "x-csrf-token": "csrf-token-123", "content-type": "application/json" },
      });

      await POST(request, { params: Promise.resolve({ path: ["auth", "session-login"] }) } as any);

      const fetchCall = mockFetch.mock.calls[0];
      if (!fetchCall) throw new Error("Expected fetch to be called");
      expect(fetchCall[1].headers.get("x-csrf-token")).toBe("csrf-token-123");
    });
  });

  describe("H. Cookie request header forwarded", () => {
    it("should forward cookie header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: { authenticated: true } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session", {
        headers: { cookie: "session=abc123" },
      });

      await GET(request, { params: Promise.resolve({ path: ["auth", "session"] }) } as any);

      const fetchCall = mockFetch.mock.calls[0];
      if (!fetchCall) throw new Error("Expected fetch to be called");
      expect(fetchCall[1].headers.get("cookie")).toBe("session=abc123");
    });
  });

  describe("I. Single Set-Cookie response preserved", () => {
    it("should preserve single Set-Cookie header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "application/json",
          "set-cookie": "__Host-eduflux.session=xyz789; Path=/; Secure; HttpOnly; SameSite=Lax",
        }),
        json: async () => ({ data: { success: true } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session-login", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      });

      const response = await POST(request, { params: Promise.resolve({ path: ["auth", "session-login"] }) } as any);

      expect(response.headers.get("set-cookie")).toBe(
        "__Host-eduflux.session=xyz789; Path=/; Secure; HttpOnly; SameSite=Lax"
      );
    });
  });

  describe("J. Multiple Set-Cookie response headers preserved", () => {
    it("should preserve multiple Set-Cookie headers", async () => {
      const headers = new Headers({
        "content-type": "application/json",
      });
      headers.append("set-cookie", "__Host-eduflux.session=xyz789; Path=/; Secure; HttpOnly");
      headers.append("set-cookie", "csrf-token=abc456; Path=/; Secure; HttpOnly");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers,
        json: async () => ({ data: { success: true } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session-login", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      });

      const response = await POST(request, { params: Promise.resolve({ path: ["auth", "session-login"] }) } as any);

      const setCookies = response.headers.getSetCookie();
      expect(setCookies).toHaveLength(2);
      expect(setCookies[0]).toContain("__Host-eduflux.session=xyz789");
      expect(setCookies[1]).toContain("csrf-token=abc456");
    });
  });

  describe("K. Upstream 401 remains 401", () => {
    it("should preserve 401 status code", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session");

      const response = await GET(request, { params: Promise.resolve({ path: ["auth", "session"] }) } as any);

      expect(response.status).toBe(401);
    });
  });

  describe("L. Upstream 500 remains 500", () => {
    it("should preserve 500 status code", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ error: { code: "INTERNAL_ERROR", message: "Server error" } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/classes");

      const response = await GET(request, { params: Promise.resolve({ path: ["classes"] }) } as any);

      expect(response.status).toBe(500);
    });
  });

  describe("M. API_INTERNAL_URL is not exposed to browser code", () => {
    it("should use server-only API_INTERNAL_URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: {} }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/csrf");

      await GET(request, { params: Promise.resolve({ path: ["auth", "csrf"] }) } as any);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://eduflux-api.vercel.app/api/v1/auth/csrf",
        expect.any(Object)
      );
    });
  });

  describe("N. No Host header forwarding bug", () => {
    it("should not forward Host header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: {} }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/csrf", {
        headers: { host: "localhost:3000" },
      });

      await GET(request, { params: Promise.resolve({ path: ["auth", "csrf"] }) } as any);

      const fetchCall = mockFetch.mock.calls[0];
      if (!fetchCall) throw new Error("Expected fetch to be called");
      expect(fetchCall[1].headers.get("host")).toBeNull();
    });
  });

  describe("O. No double slash URL", () => {
    it("should not create double slashes in upstream URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: {} }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/csrf");

      await GET(request, { params: Promise.resolve({ path: ["auth", "csrf"] }) } as any);

      const fetchCall = mockFetch.mock.calls[0];
      if (!fetchCall) throw new Error("Expected fetch to be called");
      const url = fetchCall[0];
      expect(url).not.toContain("//api/v1");
      expect(url).toBe("https://eduflux-api.vercel.app/api/v1/auth/csrf");
    });
  });

  describe("P. Authenticated requests are not cached", () => {
    it("should use cache: no-store for all requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: {} }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session", {
        headers: { cookie: "session=abc123" },
      });

      await GET(request, { params: Promise.resolve({ path: ["auth", "session"] }) } as any);

      const fetchCall = mockFetch.mock.calls[0];
      if (!fetchCall) throw new Error("Expected fetch to be called");
      expect(fetchCall[1].cache).toBe("no-store");
    });
  });

  describe("OPTIONS and HEAD methods", () => {
    it("should handle OPTIONS requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: {} }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/csrf", {
        method: "OPTIONS",
      });

      await OPTIONS(request, { params: Promise.resolve({ path: ["auth", "csrf"] }) } as any);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://eduflux-api.vercel.app/api/v1/auth/csrf",
        expect.objectContaining({ method: "OPTIONS" })
      );
    });

    it("should handle HEAD requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/csrf", {
        method: "HEAD",
      });

      const response = await HEAD(request, { params: Promise.resolve({ path: ["auth", "csrf"] }) } as any);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://eduflux-api.vercel.app/api/v1/auth/csrf",
        expect.objectContaining({ method: "HEAD" })
      );
      expect(response.status).toBe(200);
    });
  });

  describe("URL safety with different API_INTERNAL_URL formats", () => {
    it("should handle API_INTERNAL_URL with trailing slash", async () => {
      vi.stubEnv("API_INTERNAL_URL", "https://eduflux-api.vercel.app/");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: {} }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/csrf");

      await GET(request, { params: Promise.resolve({ path: ["auth", "csrf"] }) } as any);

      const fetchCall = mockFetch.mock.calls[0];
      if (!fetchCall) throw new Error("Expected fetch to be called");
      const url = fetchCall[0];
      expect(url).not.toContain("//api/v1");
      expect(url).toBe("https://eduflux-api.vercel.app/api/v1/auth/csrf");
    });

    it("should handle API_INTERNAL_URL without trailing slash", async () => {
      vi.stubEnv("API_INTERNAL_URL", "https://eduflux-api.vercel.app");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: {} }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/csrf");

      await GET(request, { params: Promise.resolve({ path: ["auth", "csrf"] }) } as any);

      const fetchCall = mockFetch.mock.calls[0];
      if (!fetchCall) throw new Error("Expected fetch to be called");
      const url = fetchCall[0];
      expect(url).toBe("https://eduflux-api.vercel.app/api/v1/auth/csrf");
    });
  });

  describe("Local development fallback", () => {
    it("should use localhost:5000 when API_INTERNAL_URL is not set", async () => {
      vi.stubEnv("API_INTERNAL_URL", "");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: {} }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/csrf");

      await GET(request, { params: Promise.resolve({ path: ["auth", "csrf"] }) } as any);

      const fetchCall = mockFetch.mock.calls[0];
      if (!fetchCall) throw new Error("Expected fetch to be called");
      const url = fetchCall[0];
      expect(url).toBe("http://localhost:5000/api/v1/auth/csrf");
    });
  });
});
