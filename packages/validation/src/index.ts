import { z } from "zod";
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.iso.datetime(),
});

const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email("Enter a valid email address."));
export const primaryPersonaSchema = z.enum(["TEACHER", "STUDENT"]);
export const registerSchema = z
  .object({
    displayName: z.string().trim().min(2, "Enter your name.").max(80),
    email: emailSchema,
    password: z
      .string()
      .min(12, "Use at least 12 characters.")
      .max(128, "Use no more than 128 characters."),
    primaryPersona: primaryPersonaSchema,
  })
  .strict();
export const loginSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(128) })
  .strict();
export const sessionLoginSchema = z
  .object({
    idToken: z.string().min(20).max(10_000),
    primaryPersona: primaryPersonaSchema.optional(),
  })
  .strict();
export const onboardingSchema = z
  .object({ primaryPersona: primaryPersonaSchema })
  .strict();
export const classSubjectLevelSchema = z.enum([
  "English",
  "English Language",
  "English Literature",
  "Academic Writing",
  "General",
  "Other",
]);
const calendarDateSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}, "Choose a valid calendar date.");
const classFieldsSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Class name must be at least 2 characters.")
      .max(100, "Class name cannot be longer than 100 characters."),
    subjectLevel: classSubjectLevelSchema,
    startDate: calendarDateSchema,
    endDate: calendarDateSchema.optional(),
    description: z
      .string()
      .trim()
      .max(500, "Description cannot be longer than 500 characters.")
      .optional(),
    allowJoinByCode: z.boolean().default(true),
    allowJoinByLink: z.boolean().default(true),
  })
  .strict();
export const createClassSchema = classFieldsSchema.refine(
  (value) => !value.endDate || value.endDate >= value.startDate,
  {
    message: "End date cannot be earlier than start date.",
    path: ["endDate"],
  },
);
export const joinClassSchema = z
  .object({
    joinCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-HJ-NP-Z2-9]{8}$/, "Enter a valid 8-character class code."),
  })
  .strict();
export const memberQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(80).default(""),
});
export const updateClassSchema = classFieldsSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one class field.",
  )
  .refine(
    (value) =>
      !value.startDate || !value.endDate || value.endDate >= value.startDate,
    {
      message: "End date cannot be earlier than start date.",
      path: ["endDate"],
    },
  );
export const assignmentStatusSchema = z.enum([
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
]);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const timestampSchema = z.iso.datetime({ offset: true });
export const rubricLevelSchema = z
  .object({
    id: z.string().min(1).max(80),
    label: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).optional(),
    points: z.number().min(0).max(10_000),
  })
  .strict();
export const rubricCriterionSchema = z
  .object({
    id: z.string().min(1).max(80),
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).optional(),
    maxPoints: z.number().positive().max(10_000),
    performanceLevels: z.array(rubricLevelSchema).max(6).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    value.performanceLevels.forEach((level, index) => {
      if (level.points > value.maxPoints)
        context.addIssue({
          code: "custom",
          message: "Level points cannot exceed criterion points.",
          path: ["performanceLevels", index, "points"],
        });
    });
  });
export const rubricSchema = z
  .object({
    version: z.number().int().positive().default(1),
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).optional(),
    criteria: z.array(rubricCriterionSchema).min(1).max(20),
  })
  .strict();
const assignmentFieldsSchema = z
  .object({
    title: z.string().trim().min(2, "Assignment title is required.").max(150),
    description: optionalText(500),
    instructions: optionalText(10_000),
    availableFrom: timestampSchema.optional(),
    dueAt: timestampSchema.optional(),
    maxScore: z.number().positive().max(10_000).default(100),
    allowLateSubmission: z.boolean().default(false),
    allowResubmission: z.boolean().default(false),
    maxAttempts: z.number().int().min(1).max(10).optional(),
    showMarks: z.boolean().default(true),
    rubric: rubricSchema.optional(),
    resourceLinks: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(100),
            url: z
              .url()
              .refine(
                (url) => ["http:", "https:"].includes(new URL(url).protocol),
                "Use an HTTP or HTTPS URL.",
              ),
          })
          .strict(),
      )
      .max(10)
      .default([]),
  })
  .strict();
export const assignmentInputSchema = assignmentFieldsSchema.refine(
  (value) =>
    !value.availableFrom || !value.dueAt || value.dueAt > value.availableFrom,
  { message: "Due date must be after availability.", path: ["dueAt"] },
);
export const updateAssignmentSchema = assignmentFieldsSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one assignment field.",
  );
export const submissionDraftSchema = z
  .object({
    typedText: z.string().max(100_000),
    fileIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(5),
    draftRevision: z.number().int().min(0).optional(),
  })
  .strict();
export const uploadIntentSchema = z
  .object({
    filename: z.string().trim().min(1).max(200),
    mimeType: z.enum([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]),
    sizeBytes: z.number().int().positive(),
  })
  .strict();
export const submissionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(80).default(""),
  filter: z
    .enum(["ALL", "SUBMITTED", "NOT_SUBMITTED", "LATE", "MULTIPLE"])
    .default("ALL"),
});
export const rubricTemplateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).optional(),
    rubric: rubricSchema,
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SessionLoginInput = z.infer<typeof sessionLoginSchema>;
export type CreateClassInput = z.infer<typeof createClassSchema>;
export type JoinClassInput = z.infer<typeof joinClassSchema>;
export type UpdateClassInput = z.infer<typeof updateClassSchema>;
export type AssignmentInput = z.infer<typeof assignmentInputSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type SubmissionDraftInput = z.infer<typeof submissionDraftSchema>;
export type UploadIntentInput = z.infer<typeof uploadIntentSchema>;
export type RubricInput = z.infer<typeof rubricSchema>;
export type RubricTemplateInput = z.infer<typeof rubricTemplateSchema>;
