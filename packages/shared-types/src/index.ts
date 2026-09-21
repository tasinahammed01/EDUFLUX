export interface HealthResponse {
  status: "ok";
  timestamp: string;
}

export type PrimaryPersona = "TEACHER" | "STUDENT";
export type PlatformRole = "USER" | "ADMIN" | "SUPER_ADMIN";
export type ClassMembershipRole = "OWNER" | "TEACHER" | "STUDENT";

export interface PublicUser {
  id: string;
  firebaseUid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  emailVerified: boolean;
  primaryPersona?: PrimaryPersona | undefined;
  platformRole: PlatformRole;
}

export interface AuthSession {
  user: PublicUser;
  requiresOnboarding: boolean;
}

export interface ClassSummary {
  id: string;
  name: string;
  subjectLevel?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  joinCode?: string;
  role: ClassMembershipRole;
  joinedAt: string;
  createdAt: string;
  memberCount?: number;
  status?: "ACTIVE" | "ARCHIVED";
  inviteToken?: string;
  joinUrl?: string;
  allowJoinByCode?: boolean;
  allowJoinByLink?: boolean;
  owner?: ClassroomUser;
}

export interface ClassroomUser {
  displayName: string;
  photoURL?: string;
  email?: string;
  role: ClassMembershipRole;
}

export interface ClassMember {
  membershipId?: string;
  displayName: string;
  email?: string;
  photoURL?: string;
  role: ClassMembershipRole;
  joinedAt: string;
}
export interface JoinPreview {
  name: string;
  subjectLevel?: string;
  startDate?: string;
  endDate?: string;
  status: "ACTIVE" | "ARCHIVED";
  teacher: ClassroomUser;
}
export interface ResourceLink {
  label: string;
  url: string;
}
export interface RubricLevel {
  id: string;
  label: string;
  description?: string;
  points: number;
}
export interface RubricCriterion {
  id: string;
  title: string;
  description?: string;
  maxPoints: number;
  performanceLevels: RubricLevel[];
}
export interface RubricDto {
  version: number;
  title: string;
  description?: string;
  criteria: RubricCriterion[];
  totalPoints: number;
}
export interface AssignmentDto {
  id: string;
  classId: string;
  title: string;
  description?: string;
  instructions?: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  availableFrom?: string;
  dueAt?: string;
  maxScore: number;
  allowLateSubmission: boolean;
  allowResubmission: boolean;
  maxAttempts?: number;
  showMarks: boolean;
  rubric?: RubricDto;
  rubricLocked?: boolean;
  resourceLinks: ResourceLink[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}
export interface SubmissionFileDto {
  id: string;
  originalName: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  status: "PENDING" | "READY";
  createdAt: string;
}
export interface SubmissionAttemptDto {
  id: string;
  attemptNumber: number;
  typedText: string;
  files: SubmissionFileDto[];
  submittedAt: string;
  isLate: boolean;
  rubricVersion?: number;
}
export interface SubmissionDto {
  id: string;
  assignmentId: string;
  classId: string;
  status: "DRAFT" | "SUBMITTED";
  draftText: string;
  draftFiles: SubmissionFileDto[];
  draftRevision: number;
  latestAttemptNumber: number;
  latestSubmittedAt?: string;
  attempts: SubmissionAttemptDto[];
  canSubmit: boolean;
  canResubmit: boolean;
  unavailableReason?: string;
  isLate: boolean;
  limits: {
    maxFiles: number;
    maxFileBytes: number;
    maxTotalBytes: number;
    allowedMimeTypes: string[];
  };
}
export interface UploadIntentDto {
  file: SubmissionFileDto;
  uploadUrl: string;
  expiresAt: string;
  requiredHeaders: Record<string, string>;
}
export interface TeacherSubmissionRow {
  submissionId?: string;
  student: {
    id: string;
    displayName: string;
    email: string;
    photoURL?: string;
  };
  status: "SUBMITTED" | "NOT_SUBMITTED";
  latestAttemptNumber: number;
  latestSubmittedAt?: string;
  isLate?: boolean;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  requestId?: string;
  fields?: Record<string, string[]>;
}
export interface ApiSuccess<T> {
  data: T;
  error: null;
}
export interface ApiFailure {
  data: null;
  error: ApiErrorBody;
}
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
