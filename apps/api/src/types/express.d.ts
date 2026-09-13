import type { ClassMembershipRole, PlatformRole, PrimaryPersona } from "@eduflux/shared-types";

declare global {
  namespace Express {
    interface Request {
      principal?: { userId: string; platformRole: PlatformRole; primaryPersona: PrimaryPersona; sessionId: string };
      classMembership?: { id: string; classId: string; userId: string; role: ClassMembershipRole };
    }
  }
}

export {};
