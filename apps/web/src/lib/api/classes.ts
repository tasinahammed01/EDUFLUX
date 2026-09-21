import type {
  AssignmentDto,
  ClassMember,
  ClassSummary,
  JoinPreview,
  SubmissionDto,
  TeacherSubmissionRow,
  SubmissionFileDto,
  UploadIntentDto,
} from "@eduflux/shared-types";
import type {
  AssignmentInput,
  CreateClassInput,
  UpdateAssignmentInput,
  UpdateClassInput,
} from "@eduflux/validation";
import { api } from "./client";

export const classesApi = {
  mine: () => api.get<{ classes: ClassSummary[] }>("/classes/mine"),
  create: (input: CreateClassInput) =>
    api.post<ClassSummary>("/classes", input),
  join: (joinCode: string) =>
    api.post<ClassSummary>("/classes/join", { joinCode }),
  one: (id: string) => api.get<ClassSummary>(`/classes/${id}`),
  members: (id: string, page = 1, search = "") =>
    api.get<{ members: ClassMember[]; total: number }>(
      `/classes/${id}/members?page=${page}&limit=20&search=${encodeURIComponent(search)}`,
    ),
  previewInvite: (token: string) =>
    api.get<JoinPreview>(`/classes/join/${encodeURIComponent(token)}/preview`),
  joinInvite: (token: string) =>
    api.post<ClassSummary>(`/classes/join/${encodeURIComponent(token)}`),
  rotateInvite: (id: string) =>
    api.post<{ inviteToken: string; joinUrl: string }>(
      `/classes/${id}/invite/rotate`,
    ),
  update: (id: string, input: UpdateClassInput) =>
    api.patch<ClassSummary>(`/classes/${id}`, input),
  archive: (id: string) =>
    api.post<{ status: string }>(`/classes/${id}/archive`),
  leave: (id: string) => api.post<{ left: boolean }>(`/classes/${id}/leave`),
  removeMember: (id: string, membershipId: string) =>
    api.delete<{ removed: boolean }>(`/classes/${id}/members/${membershipId}`),
  assignments: (id: string) =>
    api.get<{ assignments: AssignmentDto[]; total: number }>(
      `/classes/${id}/assignments`,
    ),
  assignment: (classId: string, id: string) =>
    api.get<AssignmentDto>(`/classes/${classId}/assignments/${id}`),
  createAssignment: (id: string, input: AssignmentInput) =>
    api.post<AssignmentDto>(`/classes/${id}/assignments`, input),
  updateAssignment: (
    classId: string,
    id: string,
    input: UpdateAssignmentInput,
  ) => api.patch<AssignmentDto>(`/classes/${classId}/assignments/${id}`, input),
  publishAssignment: (classId: string, id: string) =>
    api.post<AssignmentDto>(`/classes/${classId}/assignments/${id}/publish`),
  archiveAssignment: (classId: string, id: string) =>
    api.post<AssignmentDto>(`/classes/${classId}/assignments/${id}/archive`),
  submission: (classId: string, assignmentId: string) =>
    api.get<SubmissionDto>(
      `/classes/${classId}/assignments/${assignmentId}/submission`,
    ),
  saveSubmissionDraft: (
    classId: string,
    assignmentId: string,
    typedText: string,
    fileIds: string[],
    draftRevision: number,
  ) =>
    api.patch<SubmissionDto>(
      `/classes/${classId}/assignments/${assignmentId}/submission/draft`,
      { typedText, fileIds, draftRevision },
    ),
  submitAssignment: (classId: string, assignmentId: string) =>
    api.post<SubmissionDto>(
      `/classes/${classId}/assignments/${assignmentId}/submission/submit`,
    ),
  submissionRows: (
    classId: string,
    assignmentId: string,
    page = 1,
    filter = "ALL",
    search = "",
  ) =>
    api.get<{
      rows: TeacherSubmissionRow[];
      page: number;
      limit: number;
      total: number;
      summary: {
        students: number;
        submitted: number;
        notSubmitted: number;
        late: number;
      };
    }>(
      `/classes/${classId}/assignments/${assignmentId}/submissions?page=${page}&limit=20&filter=${filter}&search=${encodeURIComponent(search)}`,
    ),
  uploadIntent: (classId: string, assignmentId: string, filename: string, mimeType: string, sizeBytes: number) =>
    api.post<UploadIntentDto>(`/classes/${classId}/assignments/${assignmentId}/submission/files/intents`, { filename, mimeType, sizeBytes }),
  finalizeSubmissionFile: (fileId: string) => api.post<SubmissionFileDto>(`/submission-files/${fileId}/finalize`),
};
