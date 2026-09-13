import "server-only";
import { cookies } from "next/headers";
import type { ApiResponse, AuthSession } from "@eduflux/shared-types";

export async function getServerSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  if (!cookieHeader) return null;
  try {
    const response = await fetch(`${process.env.API_INTERNAL_URL ?? "http://localhost:5000"}/api/v1/auth/session`, { headers: { cookie: cookieHeader }, cache: "no-store" });
    if (!response.ok) return null;
    const body = await response.json() as ApiResponse<AuthSession>;
    return body.error ? null : body.data;
  } catch { return null; }
}
