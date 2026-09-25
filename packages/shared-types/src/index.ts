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
  percentage: number;
}
export interface RubricCriterion {
  id: string;
  title: string;
  description?: string;
  weight: number;
  descriptors: string[];
}
export interface RubricDto {
  version: number;
  title: string;
  description?: string;
  levels: RubricLevel[];
  criteria: RubricCriterion[];
  totalWeight: number;
  locked?: boolean;
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
  hasRubric: boolean;
  rubricRevisionNumber?: number;
  rubricLocked?: boolean;
  submissionStats?: {
    eligibleStudentCount: number;
    submittedCount: number;
    lateCount: number;
  };
  studentSubmission?: StudentAssignmentSubmissionSummary;
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
  rubricRevisionId?: string;
  rubricRevisionNumber?: number;
  rubricHash?: string;
}
export interface StudentAssignmentSubmissionSummary {
  assignmentId: string;
  submissionId?: string;
  submissionState: "NONE" | "DRAFT" | "SUBMITTED";
  latestAttemptNumber: number;
  latestAttemptId?: string;
  evaluationStatus?: EvaluationStatus;
  latestSubmittedAt?: string;
  draftRevision?: number;
  canResubmit: boolean;
  isLate: boolean;
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
export interface SubmitWorkResultDto {
  submission: SubmissionDto;
  attempt: { id: string; attemptNumber: number; submittedAt: string };
  evaluation: { id: string; status: EvaluationStatus };
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

export type EvaluationStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";
export interface SubmissionReviewStatusDto {
  status: EvaluationStatus;
  processingStage?: EvaluationProcessingStage;
  statusMessage?: string;
  failureStage?: "OCR" | "AI_EVALUATION" | "VALIDATION" | "PERSISTENCE";
  failureCode?: string;
  updatedAt: string;
}
export const CORRECTION_LEGEND = {
  REL: { label: "Relevance", category: "content" },
  DEV: { label: "Idea Development", category: "content" },
  TA: { label: "Task Achievement", category: "content" },
  CL: { label: "Clarity of Ideas", category: "content" },
  SD: { label: "Supporting Details", category: "content" },
  COH: { label: "Coherence", category: "organization" },
  CO: { label: "Cohesion", category: "organization" },
  PU: { label: "Paragraph Unity", category: "organization" },
  TS: { label: "Topic Sentence", category: "organization" },
  CONC: { label: "Conclusion", category: "organization" },
  T: { label: "Tense", category: "grammar" },
  VF: { label: "Verb Form", category: "grammar" },
  AGR: { label: "Subject–Verb Agreement", category: "grammar" },
  FRAG: { label: "Sentence Fragment", category: "grammar" },
  RO: { label: "Run-on Sentence", category: "grammar" },
  WO: { label: "Word Order", category: "grammar" },
  ART: { label: "Article Use", category: "grammar" },
  PREP: { label: "Preposition", category: "grammar" },
  WC: { label: "Word Choice", category: "vocabulary" },
  WF: { label: "Word Form", category: "vocabulary" },
  REP: { label: "Repetition", category: "vocabulary" },
  FORM: { label: "Formal / Inappropriate Word", category: "vocabulary" },
  COL: { label: "Collocation", category: "vocabulary" },
  SP: { label: "Spelling", category: "mechanics" },
  P: { label: "Punctuation", category: "mechanics" },
  CAP: { label: "Capitalization", category: "mechanics" },
  SPC: { label: "Spacing", category: "mechanics" },
  FMT: { label: "Formatting", category: "mechanics" },
} as const;
export type CorrectionCode = keyof typeof CORRECTION_LEGEND;
export type CorrectionCategory =
  (typeof CORRECTION_LEGEND)[CorrectionCode]["category"];
export const CORRECTION_CODES = Object.keys(
  CORRECTION_LEGEND,
) as CorrectionCode[];
export type EvaluationProcessingStage =
  | "PENDING"
  | "OCR"
  | "AI_EVALUATION"
  | "FINALIZING"
  | "COMPLETED";
export interface SubmissionReviewIssue {
  id: string;
  code: string;
  label: string;
  category: string;
  severity?: "low" | "medium" | "high";
  originalText: string;
  suggestedText?: string;
  explanation?: string;
  startIndex?: number;
  endIndex?: number;
  page?: number;
  source?: "TYPED" | "OCR_FILE";
  sourceFileId?: string;
  wordIds?: string[];
  pageNumbers?: number[];
}
export interface OcrReviewWord {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
  confidence?: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}
export interface OcrReviewPage {
  sourceFileId: string;
  pageNumber: number;
  width: number;
  height: number;
  startOffset: number;
  endOffset: number;
  text: string;
  words: OcrReviewWord[];
}
export interface SubmissionReviewDto {
  id: string;
  submissionId: string;
  attemptId: string;
  assignmentId: string;
  classId: string;
  student: {
    id: string;
    displayName: string;
    email: string;
    photoURL?: string;
  };
  attemptNumber: number;
  submittedAt: string;
  status: EvaluationStatus;
  processingStage?: EvaluationProcessingStage;
  statusMessage?: string;
  failureStage?: "OCR" | "AI_EVALUATION" | "VALIDATION" | "PERSISTENCE";
  failureCode?: string;
  typedText: string;
  transcribedText: string;
  effectiveText: string;
  files: Array<SubmissionFileDto & { contentUrl?: string }>;
  ocrPages?: OcrReviewPage[];
  rubricRevisionId?: string;
  rubricRevisionNumber?: number;
  issues: SubmissionReviewIssue[];
  overallScore?: number;
  maxScore?: number;
  correctionStats: Record<string, number>;
  legendSummary: Array<{ code: string; label: string; count: number }>;
  strengths: Array<{ title: string; description: string }>;
  feedbackSections: Array<{
    title: string;
    category: string;
    score: number;
    maxScore: number;
    summary: string;
    suggestions: string[];
  }>;
  teacherComment?: string;
  completedAt?: string;
  updatedAt: string;
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
