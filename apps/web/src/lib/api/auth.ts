import type { AuthSession, PrimaryPersona } from "@eduflux/shared-types";
import { api } from "./client";

export const authApi = {
  session:()=>api.get<AuthSession>("/auth/session"),
  sessionLogin: (input: { idToken: string; primaryPersona?: PrimaryPersona }) => api.post<AuthSession>("/auth/session-login", input),
  onboarding: (primaryPersona: PrimaryPersona) => api.post<AuthSession>("/auth/onboarding", { primaryPersona }),
  logout: () => api.post<{ success: boolean }>("/auth/logout"),
  logoutAll: () => api.post<{ success: boolean }>("/auth/logout-all")
};
