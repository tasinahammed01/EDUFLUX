import { NextRequest, NextResponse } from "next/server";

function getApiInternalUrl(): string {
  const url = process.env.API_INTERNAL_URL;
  return url && url.trim() ? url : "http://localhost:5000";
}

// Headers that should not be forwarded from request
const HOP_BY_HOP_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
  "keep-alive",
  "te",
  "trailer",
  "upgrade",
  "proxy-authorization",
  "proxy-authenticate",
]);

// Headers that should not be forwarded from response (compression metadata)
const RESPONSE_HEADERS_TO_REMOVE = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "te",
  "trailer",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
]);

// Headers that are safe to forward from request
const SAFE_FORWARD_HEADERS = [
  "content-type",
  "authorization",
  "x-csrf-token",
  "cookie",
  "user-agent",
  "x-requested-with",
];

function buildUpstreamUrl(path: string, searchParams: URLSearchParams): string {
  // Remove leading slash from path to avoid double slashes
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const baseUrl = getApiInternalUrl().replace(/\/$/, "");
  const queryString = searchParams.toString();
  // Add /api/v1/ prefix since the route handler is at /api/v1/[...path]
  return `${baseUrl}/api/v1/${cleanPath}${queryString ? `?${queryString}` : ""}`;
}

function filterRequestHeaders(headers: Headers): Headers {
  const filtered = new Headers();
  for (const [key, value] of headers.entries()) {
    const lowerKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lowerKey)) continue;
    // Do NOT forward accept-encoding to avoid upstream compression
    if (lowerKey === "accept-encoding") continue;
    if (SAFE_FORWARD_HEADERS.includes(lowerKey)) {
      filtered.set(key, value);
    }
  }
  // Request uncompressed response from upstream
  filtered.set("accept-encoding", "identity");
  return filtered;
}

function filterResponseHeaders(headers: Headers): Headers {
  const filtered = new Headers();
  for (const [key, value] of headers.entries()) {
    const lowerKey = key.toLowerCase();
    // Preserve Set-Cookie headers
    if (lowerKey === "set-cookie") {
      filtered.append(key, value);
    } else if (!RESPONSE_HEADERS_TO_REMOVE.has(lowerKey)) {
      filtered.set(key, value);
    }
  }
  return filtered;
}

function shouldHaveBody(status: number): boolean {
  // 204 No Content and 205 Reset Content must not have a body
  return status !== 204 && status !== 205;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  const pathString = path.join("/");
  const searchParams = request.nextUrl.searchParams;
  const upstreamUrl = buildUpstreamUrl(pathString, searchParams);

  const response = await fetch(upstreamUrl, {
    method: "GET",
    headers: filterRequestHeaders(request.headers),
    cache: "no-store",
  });

  const filteredHeaders = filterResponseHeaders(response.headers);
  const body = shouldHaveBody(response.status) ? await response.text() : null;
  return new NextResponse(body, {
    status: response.status,
    headers: filteredHeaders,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  const pathString = path.join("/");
  const searchParams = request.nextUrl.searchParams;
  const upstreamUrl = buildUpstreamUrl(pathString, searchParams);

  const body = await request.text();

  const response = await fetch(upstreamUrl, {
    method: "POST",
    headers: filterRequestHeaders(request.headers),
    body,
    cache: "no-store",
  });

  const filteredHeaders = filterResponseHeaders(response.headers);
  const responseBody = shouldHaveBody(response.status) ? await response.text() : null;
  return new NextResponse(responseBody, {
    status: response.status,
    headers: filteredHeaders,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  const pathString = path.join("/");
  const searchParams = request.nextUrl.searchParams;
  const upstreamUrl = buildUpstreamUrl(pathString, searchParams);

  const body = await request.text();

  const response = await fetch(upstreamUrl, {
    method: "PUT",
    headers: filterRequestHeaders(request.headers),
    body,
    cache: "no-store",
  });

  const filteredHeaders = filterResponseHeaders(response.headers);
  const responseBody = shouldHaveBody(response.status) ? await response.text() : null;
  return new NextResponse(responseBody, {
    status: response.status,
    headers: filteredHeaders,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  const pathString = path.join("/");
  const searchParams = request.nextUrl.searchParams;
  const upstreamUrl = buildUpstreamUrl(pathString, searchParams);

  const body = await request.text();

  const response = await fetch(upstreamUrl, {
    method: "PATCH",
    headers: filterRequestHeaders(request.headers),
    body,
    cache: "no-store",
  });

  const filteredHeaders = filterResponseHeaders(response.headers);
  const responseBody = shouldHaveBody(response.status) ? await response.text() : null;
  return new NextResponse(responseBody, {
    status: response.status,
    headers: filteredHeaders,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  const pathString = path.join("/");
  const searchParams = request.nextUrl.searchParams;
  const upstreamUrl = buildUpstreamUrl(pathString, searchParams);

  const response = await fetch(upstreamUrl, {
    method: "DELETE",
    headers: filterRequestHeaders(request.headers),
    cache: "no-store",
  });

  const filteredHeaders = filterResponseHeaders(response.headers);
  const responseBody = shouldHaveBody(response.status) ? await response.text() : null;
  return new NextResponse(responseBody, {
    status: response.status,
    headers: filteredHeaders,
  });
}

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  const pathString = path.join("/");
  const searchParams = request.nextUrl.searchParams;
  const upstreamUrl = buildUpstreamUrl(pathString, searchParams);

  const response = await fetch(upstreamUrl, {
    method: "OPTIONS",
    headers: filterRequestHeaders(request.headers),
    cache: "no-store",
  });

  const filteredHeaders = filterResponseHeaders(response.headers);
  const responseBody = shouldHaveBody(response.status) ? await response.text() : null;
  return new NextResponse(responseBody, {
    status: response.status,
    headers: filteredHeaders,
  });
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  const pathString = path.join("/");
  const searchParams = request.nextUrl.searchParams;
  const upstreamUrl = buildUpstreamUrl(pathString, searchParams);

  const response = await fetch(upstreamUrl, {
    method: "HEAD",
    headers: filterRequestHeaders(request.headers),
    cache: "no-store",
  });

  const filteredHeaders = filterResponseHeaders(response.headers);
  // HEAD responses must not have a body
  return new NextResponse(null, {
    status: response.status,
    headers: filteredHeaders,
  });
}
