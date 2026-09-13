import { z } from "zod";
export const healthResponseSchema = z.object({ status: z.literal("ok"), timestamp: z.iso.datetime() });

const emailSchema = z.string().trim().max(254).pipe(z.email("Enter a valid email address."));
export const primaryPersonaSchema = z.enum(["TEACHER", "STUDENT"]);
export const registerSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your name.").max(80),
  email: emailSchema,
  password: z.string().min(12, "Use at least 12 characters.").max(128, "Use no more than 128 characters."),
  primaryPersona: primaryPersonaSchema
}).strict();
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).strict();
export const createClassSchema = z.object({ name: z.string().trim().min(2).max(100), description: z.string().trim().max(500).optional() }).strict();
export const joinClassSchema = z.object({ joinCode: z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{8}$/, "Enter a valid 8-character class code.") }).strict();
export const memberQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateClassInput = z.infer<typeof createClassSchema>;
export type JoinClassInput = z.infer<typeof joinClassSchema>;
