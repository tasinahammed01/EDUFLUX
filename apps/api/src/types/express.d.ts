import type { ClassMembershipRole, PlatformRole, PrimaryPersona } from "@eduflux/shared-types";

declare global {
  namespace Express {
    interface Request {
      principal?: { userId: string; firebaseUid: string; platformRole: PlatformRole; primaryPersona?: PrimaryPersona };
      classMembership?: { id: string; classId: string; userId: string; role: ClassMembershipRole };
    }
  }
}

export {};
