import type { AuthSession, PrimaryPersona } from "@eduflux/shared-types";
import { api } from "./client";

export const authApi = {
  register: (input: { displayName: string; email: string; password: string; primaryPersona: PrimaryPersona }) => api.post<AuthSession>("/auth/register", input),
  login: (input: { email: string; password: string }) => api.post<AuthSession>("/auth/login", input),
  logout: () => api.post<{ success: boolean }>("/auth/logout"),
  logoutAll: () => api.post<{ success: boolean }>("/auth/logout-all")
};
