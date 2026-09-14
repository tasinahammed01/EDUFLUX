export interface HealthResponse { status: "ok"; timestamp: string }

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

export interface AuthSession { user: PublicUser; requiresOnboarding: boolean }

export interface ClassSummary {
  id: string;
  name: string;
  description?: string;
  joinCode?: string;
  role: ClassMembershipRole;
  joinedAt: string;
  createdAt: string;
  memberCount?: number;
}

export interface ClassMember {
  userId: string;
  displayName: string;
  role: ClassMembershipRole;
  joinedAt: string;
}

export interface ApiErrorBody { code: string; message: string; requestId?: string; fields?: Record<string, string[]> }
export interface ApiSuccess<T> { data: T; error: null }
export interface ApiFailure { data: null; error: ApiErrorBody }
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
