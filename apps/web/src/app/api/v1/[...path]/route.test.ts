import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD } from "./route";
import { NextRequest } from "next/server";

// Type for the params object used in tests
type TestParams = { params: Promise<{ path: string[] }> };

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
        text: async () => JSON.stringify({ data: { success: true } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session");
      const response = await GET(request, { params: Promise.resolve({ path: ["auth", "session"] }) } as TestParams);

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
        text: async () => JSON.stringify({ data: { classes: [] } }),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/v1/classes?page=2&limit=20"
      );
      await GET(request, { params: Promise.resolve({ path: ["classes"] }) } as TestParams);

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
        text: async () => JSON.stringify({ data: { token: "abc123" } }),
      });

      const body = JSON.stringify({ email: "test@example.com", password: "secret" });
      const request = new NextRequest("http://localhost:3000/api/v1/auth/session-login", {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
      });

      await POST(request, { params: Promise.resolve({ path: ["auth", "session-login"] }) } as TestParams);

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
        text: async () => JSON.stringify({ data: { updated: true } }),
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
      } as TestParams);

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
        text: async () => JSON.stringify({ data: { updated: true } }),
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
      } as TestParams);

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
        text: async () => JSON.stringify({ data: { deleted: true } }),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/v1/submission-files/file123",
        { method: "DELETE" }
      );

      await DELETE(request, { params: Promise.resolve({ path: ["submission-files", "file123"] }) } as TestParams);

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
        text: async () => JSON.stringify({ data: { success: true } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session-login", {
        method: "POST",
        body: "{}",
        headers: { "x-csrf-token": "csrf-token-123", "content-type": "application/json" },
      });

      await POST(request, { params: Promise.resolve({ path: ["auth", "session-login"] }) } as TestParams);

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
        text: async () => JSON.stringify({ data: { authenticated: true } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session", {
        headers: { cookie: "session=abc123" },
      });

      await GET(request, { params: Promise.resolve({ path: ["auth", "session"] }) } as TestParams);

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
        text: async () => JSON.stringify({ data: { success: true } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session-login", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      });

      const response = await POST(request, { params: Promise.resolve({ path: ["auth", "session-login"] }) } as TestParams);

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
        text: async () => JSON.stringify({ data: { success: true } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session-login", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      });

      const response = await POST(request, { params: Promise.resolve({ path: ["auth", "session-login"] }) } as TestParams);

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
        text: async () => JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session");

      const response = await GET(request, { params: Promise.resolve({ path: ["auth", "session"] }) } as TestParams);

      expect(response.status).toBe(401);
    });
  });

  describe("L. Upstream 500 remains 500", () => {
    it("should preserve 500 status code", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Server error" } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/classes");

      const response = await GET(request, { params: Promise.resolve({ path: ["classes"] }) } as TestParams);

      expect(response.status).toBe(500);
    });
  });

  describe("M. API_INTERNAL_URL is not exposed to browser code", () => {
    it("should use server-only API_INTERNAL_URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ data: {} }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/csrf");

      await GET(request, { params: Promise.resolve({ path: ["auth", "csrf"] }) } as TestParams);

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
        text: async () => JSON.stringify({ data: {} }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/csrf", {
        headers: { host: "localhost:3000" },
      });

      await GET(request, { params: Promise.resolve({ path: ["auth", "csrf"] }) } as TestParams);

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
        text: async () => JSON.stringify({ data: {} }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/csrf");

      await GET(request, { params: Promise.resolve({ path: ["auth", "csrf"] }) } as TestParams);

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
        text: async () => JSON.stringify({ data: {} }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session", {
        headers: { cookie: "session=abc123" },
      });

      await GET(request, { params: Promise.resolve({ path: ["auth", "session"] }) } as TestParams);

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
        text: async () => JSON.stringify({ data: {} }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/csrf", {
        method: "OPTIONS",
      });

      await OPTIONS(request, { params: Promise.resolve({ path: ["auth", "csrf"] }) } as TestParams);

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

      const response = await HEAD(request, { params: Promise.resolve({ path: ["auth", "csrf"] }) } as TestParams);

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
        text: async () => JSON.stringify({ data: {} }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/csrf");

      await GET(request, { params: Promise.resolve({ path: ["auth", "csrf"] }) } as TestParams);

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
        text: async () => JSON.stringify({ data: {} }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/csrf");

      await GET(request, { params: Promise.resolve({ path: ["auth", "csrf"] }) } as TestParams);

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
        text: async () => JSON.stringify({ data: {} }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/csrf");

      await GET(request, { params: Promise.resolve({ path: ["auth", "csrf"] }) } as TestParams);

      const fetchCall = mockFetch.mock.calls[0];
      if (!fetchCall) throw new Error("Expected fetch to be called");
      const url = fetchCall[0];
      expect(url).toBe("http://localhost:5000/api/v1/auth/csrf");
    });
  });

  describe("Compression regression tests", () => {
    it("should strip Content-Encoding from gzip upstream response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "application/json",
          "content-encoding": "gzip",
          "content-length": "123",
        }),
        text: async () => JSON.stringify({ data: { success: true } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session");
      const response = await GET(request, { params: Promise.resolve({ path: ["auth", "session"] }) } as TestParams);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-encoding")).toBeNull();
      expect(response.headers.get("content-length")).toBeNull();
      const body = await response.text();
      expect(() => JSON.parse(body)).not.toThrow();
    });

    it("should strip Content-Encoding from brotli upstream response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "application/json",
          "content-encoding": "br",
          "content-length": "456",
        }),
        text: async () => JSON.stringify({ data: { success: true } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session");
      const response = await GET(request, { params: Promise.resolve({ path: ["auth", "session"] }) } as TestParams);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-encoding")).toBeNull();
      expect(response.headers.get("content-length")).toBeNull();
      const body = await response.text();
      expect(() => JSON.parse(body)).not.toThrow();
    });

    it("should strip Content-Encoding from deflate upstream response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "application/json",
          "content-encoding": "deflate",
          "content-length": "789",
        }),
        text: async () => JSON.stringify({ data: { success: true } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session");
      const response = await GET(request, { params: Promise.resolve({ path: ["auth", "session"] }) } as TestParams);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-encoding")).toBeNull();
      expect(response.headers.get("content-length")).toBeNull();
      const body = await response.text();
      expect(() => JSON.parse(body)).not.toThrow();
    });

    it("should handle plain uncompressed response correctly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "application/json",
        }),
        text: async () => JSON.stringify({ data: { success: true } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session");
      const response = await GET(request, { params: Promise.resolve({ path: ["auth", "session"] }) } as TestParams);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-encoding")).toBeNull();
      const body = await response.text();
      expect(() => JSON.parse(body)).not.toThrow();
    });

    it("should strip transfer-encoding from upstream response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "application/json",
          "transfer-encoding": "chunked",
        }),
        text: async () => JSON.stringify({ data: { success: true } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session");
      const response = await GET(request, { params: Promise.resolve({ path: ["auth", "session"] }) } as TestParams);

      expect(response.status).toBe(200);
      expect(response.headers.get("transfer-encoding")).toBeNull();
    });
  });

  describe("Rubric generation endpoint test", () => {
    it("should handle rubric generation response correctly", async () => {
      const rubricResponse = {
        data: {
          rubric: {
            criteria: [
              { id: "c1", name: "Content", description: "Quality of content", maxPoints: 10 },
              { id: "c2", name: "Grammar", description: "Grammar and spelling", maxPoints: 5 },
            ],
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "application/json",
          "content-encoding": "gzip",
          "content-length": "1024",
        }),
        text: async () => JSON.stringify(rubricResponse),
      });

      const request = new NextRequest(
        "http://localhost:3000/api/v1/classes/class123/assignments/assign456/rubric/generate",
        {
          method: "POST",
          body: JSON.stringify({ prompt: "Generate rubric for essay" }),
          headers: { "content-type": "application/json" },
        }
      );

      const response = await POST(request, {
        params: Promise.resolve({
          path: ["classes", "class123", "assignments", "assign456", "rubric", "generate"],
        }),
      } as TestParams);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-encoding")).toBeNull();
      expect(response.headers.get("content-length")).toBeNull();
      expect(response.headers.get("content-type")).toBe("application/json");

      const body = await response.text();
      const parsedBody = JSON.parse(body);
      expect(parsedBody).toEqual(rubricResponse);
    });
  });

  describe("Auth endpoint regression tests", () => {
    it("should handle CSRF endpoint correctly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "application/json",
          "set-cookie": "csrf-token=abc123; Path=/; Secure; HttpOnly; SameSite=Lax",
        }),
        text: async () => JSON.stringify({ data: { csrfToken: "abc123" } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/csrf");
      const response = await GET(request, { params: Promise.resolve({ path: ["auth", "csrf"] }) } as TestParams);

      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toContain("csrf-token=abc123");
      const body = await response.text();
      expect(() => JSON.parse(body)).not.toThrow();
    });

    it("should handle session-login endpoint correctly", async () => {
      const headers = new Headers({
        "content-type": "application/json",
      });
      headers.append("set-cookie", "__Host-eduflux.session=xyz789; Path=/; Secure; HttpOnly; SameSite=Lax");
      headers.append("set-cookie", "csrf-token=updated456; Path=/; Secure; HttpOnly");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers,
        text: async () => JSON.stringify({ data: { success: true } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session-login", {
        method: "POST",
        body: JSON.stringify({ email: "test@example.com", password: "secret" }),
        headers: { "content-type": "application/json" },
      });

      const response = await POST(request, { params: Promise.resolve({ path: ["auth", "session-login"] }) } as TestParams);

      expect(response.status).toBe(200);
      const setCookies = response.headers.getSetCookie();
      expect(setCookies).toHaveLength(2);
      expect(setCookies[0]).toContain("__Host-eduflux.session=xyz789");
      expect(setCookies[1]).toContain("csrf-token=updated456");

      const body = await response.text();
      expect(() => JSON.parse(body)).not.toThrow();
    });

    it("should handle session endpoint correctly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "application/json",
        }),
        text: async () => JSON.stringify({ data: { user: { id: "user123", email: "test@example.com" } } }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session");
      const response = await GET(request, { params: Promise.resolve({ path: ["auth", "session"] }) } as TestParams);

      expect(response.status).toBe(200);
      const body = await response.text();
      const parsedBody = JSON.parse(body);
      expect(parsedBody.data.user.email).toBe("test@example.com");
    });
  });

  describe("204 and HEAD response handling", () => {
    it("should handle 204 No Content response without body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers({}),
        text: async () => "",
      });

      const request = new NextRequest("http://localhost:3000/api/v1/resource/123", {
        method: "DELETE",
      });

      const response = await DELETE(request, { params: Promise.resolve({ path: ["resource", "123"] }) } as TestParams);

      expect(response.status).toBe(204);
      const body = await response.text();
      expect(body).toBe("");
    });

    it("should handle HEAD request without body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/resource/123", {
        method: "HEAD",
      });

      const response = await HEAD(request, { params: Promise.resolve({ path: ["resource", "123"] }) } as TestParams);

      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toBe("");
    });
  });

  describe("Request Accept-Encoding handling", () => {
    it("should not forward browser Accept-Encoding header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ data: {} }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session", {
        headers: { "accept-encoding": "gzip, deflate, br" },
      });

      await GET(request, { params: Promise.resolve({ path: ["auth", "session"] }) } as TestParams);

      const fetchCall = mockFetch.mock.calls[0];
      if (!fetchCall) throw new Error("Expected fetch to be called");
      expect(fetchCall[1].headers.get("accept-encoding")).toBe("identity");
    });

    it("should set Accept-Encoding: identity for upstream request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ data: {} }),
      });

      const request = new NextRequest("http://localhost:3000/api/v1/auth/session");

      await GET(request, { params: Promise.resolve({ path: ["auth", "session"] }) } as TestParams);

      const fetchCall = mockFetch.mock.calls[0];
      if (!fetchCall) throw new Error("Expected fetch to be called");
      expect(fetchCall[1].headers.get("accept-encoding")).toBe("identity");
    });
  });
});
