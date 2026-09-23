import { Router } from "express";
import {
  createClassSchema,
  joinClassSchema,
  memberQuerySchema,
  updateClassSchema,
} from "@eduflux/validation";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireCsrf } from "../auth/csrf.middleware.js";
import { joinRateLimit } from "../auth/rate-limits.js";
import { validateBody } from "../../middleware/validate.js";
import { sendData } from "../../utils/respond.js";
import {
  archiveClass,
  createClass,
  deleteClass,
  editClass,
  getClassForMember,
  joinByInvite,
  joinClass,
  leaveClass,
  listMyClasses,
  previewInvite,
  removeStudent,
  restoreClass,
  rotateInvite,
} from "./class.service.js";
import {
  requireClassMembership,
  requireClassRole,
} from "./class.middleware.js";
import { countFilteredMembers, listMembers } from "./class.repository.js";
import { ApiError } from "../../utils/api-error.js";
import { assignmentRouter } from "../assignments/assignment.routes.js";

export const classRouter = Router();
classRouter.get("/join/:token/preview", async (request, response, next) => {
  try {
    sendData(response, await previewInvite(String(request.params.token)));
  } catch (error) {
    next(error);
  }
});
classRouter.use(requireAuth);
classRouter.post(
  "/",
  requireCsrf,
  validateBody(createClassSchema),
  async (request, response, next) => {
    try {
      sendData(
        response,
        await createClass(
          request.body,
          request.principal!.userId,
          request.principal!.primaryPersona,
        ),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
);
classRouter.get("/mine", async (request, response, next) => {
  try {
    sendData(response, {
      classes: await listMyClasses(request.principal!.userId),
    });
  } catch (error) {
    next(error);
  }
});
classRouter.post(
  "/join",
  joinRateLimit,
  requireCsrf,
  validateBody(joinClassSchema),
  async (request, response, next) => {
    try {
      sendData(
        response,
        await joinClass(request.body, request.principal!.userId),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
);
classRouter.post(
  "/join/:token",
  joinRateLimit,
  requireCsrf,
  async (request, response, next) => {
    try {
      sendData(
        response,
        await joinByInvite(
          String(request.params.token),
          request.principal!.userId,
        ),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
);
classRouter.use("/:classId/assignments", assignmentRouter);
classRouter.get(
  "/:classId",
  requireClassMembership,
  async (request, response, next) => {
    try {
      sendData(
        response,
        await getClassForMember(
          request.classMembership!.classId,
          request.principal!.userId,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);
classRouter.patch(
  "/:classId",
  requireCsrf,
  requireClassMembership,
  requireClassRole("OWNER", "TEACHER"),
  validateBody(updateClassSchema),
  async (request, response, next) => {
    try {
      sendData(
        response,
        await editClass(request.classMembership!.classId, request.body),
      );
    } catch (error) {
      next(error);
    }
  },
);
classRouter.post(
  "/:classId/archive",
  requireCsrf,
  requireClassMembership,
  requireClassRole("OWNER"),
  async (request, response, next) => {
    try {
      sendData(response, await archiveClass(request.classMembership!.classId));
    } catch (error) {
      next(error);
    }
  },
);
classRouter.post(
  "/:classId/restore",
  requireCsrf,
  requireClassMembership,
  requireClassRole("OWNER"),
  async (request, response, next) => {
    try {
      sendData(response, await restoreClass(request.classMembership!.classId));
    } catch (error) {
      next(error);
    }
  },
);
classRouter.delete(
  "/:classId",
  requireCsrf,
  requireClassMembership,
  requireClassRole("OWNER"),
  async (request, response, next) => {
    try {
      sendData(response, await deleteClass(request.classMembership!.classId));
    } catch (error) {
      next(error);
    }
  },
);
classRouter.post(
  "/:classId/invite/rotate",
  requireCsrf,
  requireClassMembership,
  requireClassRole("OWNER"),
  async (request, response, next) => {
    try {
      sendData(response, await rotateInvite(request.classMembership!.classId));
    } catch (error) {
      next(error);
    }
  },
);
classRouter.post(
  "/:classId/leave",
  requireCsrf,
  requireClassMembership,
  async (request, response, next) => {
    try {
      sendData(
        response,
        await leaveClass(
          request.classMembership!.classId,
          request.principal!.userId,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);
classRouter.delete(
  "/:classId/members/:membershipId",
  requireCsrf,
  requireClassMembership,
  requireClassRole("OWNER"),
  async (request, response, next) => {
    try {
      sendData(
        response,
        await removeStudent(
          request.classMembership!.classId,
          String(request.params.membershipId),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);
classRouter.get(
  "/:classId/members",
  requireClassMembership,
  async (request, response, next) => {
    try {
      const query = memberQuerySchema.safeParse(request.query);
      if (!query.success)
        return next(
          new ApiError(400, "VALIDATION_ERROR", "Invalid pagination values."),
        );
      const { page, limit, search } = query.data;
      const classId = request.classMembership!.classId;
      const privileged = request.classMembership!.role !== "STUDENT";
      const effectiveSearch = privileged ? search : "";
      const [members, total] = await Promise.all([
        listMembers(classId, (page - 1) * limit, limit, effectiveSearch),
        countFilteredMembers(classId, effectiveSearch),
      ]);
      sendData(response, {
        members: members.map((member) => ({
          ...(privileged
            ? { membershipId: member.membershipId.toString() }
            : {}),
          displayName: member.displayName,
          ...(privileged && member.email ? { email: member.email } : {}),
          ...(member.photoURL ? { photoURL: member.photoURL } : {}),
          role: member.role,
          joinedAt: member.joinedAt.toISOString(),
        })),
        page,
        limit,
        total,
      });
    } catch (error) {
      next(error);
    }
  },
);
