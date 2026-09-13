import type { PublicUser } from "@eduflux/shared-types";
import type { UserRecord } from "./user.model.js";

export function mapUserToPublicUser(user: Pick<UserRecord, "_id" | "displayName" | "email" | "primaryPersona" | "platformRole">): PublicUser {
  return { id: user._id.toString(), displayName: user.displayName, email: user.email, primaryPersona: user.primaryPersona, platformRole: user.platformRole };
}
