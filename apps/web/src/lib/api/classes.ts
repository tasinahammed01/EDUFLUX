import type { ClassMember, ClassSummary } from "@eduflux/shared-types";
import { api } from "./client";

export const classesApi = {
  mine: () => api.get<{ classes: ClassSummary[] }>("/classes/mine"),
  create: (input: { name: string; description?: string }) => api.post<ClassSummary>("/classes", input),
  join: (joinCode: string) => api.post<ClassSummary>("/classes/join", { joinCode }),
  one: (id: string) => api.get<ClassSummary>(`/classes/${id}`),
  members: (id: string) => api.get<{ members: ClassMember[]; total: number }>(`/classes/${id}/members`)
};
