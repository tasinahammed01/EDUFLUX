import type { LoginInput, RegisterInput } from "@eduflux/validation";
import type { PublicUser } from "@eduflux/shared-types";
import { ApiError, isDuplicateKeyError } from "../../utils/api-error.js";
import { createUser, canonicalizeEmail, findUserForAuthentication, recordFailedLogin, recordSuccessfulLogin } from "../users/user.repository.js";
import { mapUserToPublicUser } from "../users/user.mapper.js";
import { createSessionRecord, revokeAllUserSessions, revokeSessionByTokenHash } from "./session.repository.js";
import { env } from "../../config/env.js";
import { generateSessionToken, hashIp, hashPassword, hashSessionToken, verifyPassword } from "./security.js";

interface RequestContext { ip: string; userAgent?: string }
interface AuthResult { user: PublicUser; sessionToken: string }

async function issueSession(userId: string, context: RequestContext): Promise<string> {
  const token = generateSessionToken();
  await createSessionRecord({ userId, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + env.SESSION_TTL_DAYS * 86_400_000), lastSeenAt: new Date(), ...(context.userAgent ? { userAgent: context.userAgent.slice(0, 300) } : {}), ipHash: hashIp(context.ip) });
  return token;
}

export async function register(input: RegisterInput, context: RequestContext): Promise<AuthResult> {
  const emailCanonical = canonicalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await createUser({ email: emailCanonical, emailCanonical, displayName: input.displayName, passwordHash, primaryPersona: input.primaryPersona });
    return { user: mapUserToPublicUser(user), sessionToken: await issueSession(user._id.toString(), context) };
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new ApiError(409, "EMAIL_ALREADY_REGISTERED", "An account with this email already exists.");
    throw error;
  }
}

let dummyPasswordHash: Promise<string> | undefined;
function getDummyPasswordHash(): Promise<string> { return (dummyPasswordHash ??= hashPassword("EduFlux timing equalizer passphrase")); }

export async function login(input: LoginInput, context: RequestContext): Promise<AuthResult> {
  const user = await findUserForAuthentication(canonicalizeEmail(input.email));
  if (!user) {
    await verifyPassword(await getDummyPasswordHash(), input.password);
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }
  if (user.status !== "ACTIVE") throw new ApiError(403, "ACCOUNT_DISABLED", "This account is not available.");
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) throw new ApiError(429, "ACCOUNT_LOCKED", "Too many attempts. Try again later.");
  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    await recordFailedLogin(user._id.toString(), user.failedLoginCount);
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }
  await recordSuccessfulLogin(user._id.toString());
  return { user: mapUserToPublicUser(user), sessionToken: await issueSession(user._id.toString(), context) };
}

export async function logout(token?: string): Promise<void> { if (token) await revokeSessionByTokenHash(hashSessionToken(token)); }
export async function logoutAll(userId: string): Promise<void> { await revokeAllUserSessions(userId); }
