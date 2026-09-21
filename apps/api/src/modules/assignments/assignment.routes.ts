import { Router } from "express";
import mongoose from "mongoose";
import {
  assignmentInputSchema,
  memberQuerySchema,
  submissionDraftSchema,
  submissionQuerySchema,
  updateAssignmentSchema,
  uploadIntentSchema,
} from "@eduflux/validation";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireCsrf } from "../auth/csrf.middleware.js";
import {
  requireClassMembership,
  requireClassRole,
} from "../classes/class.middleware.js";
import { validateBody } from "../../middleware/validate.js";
import { sendData } from "../../utils/respond.js";
import { ApiError } from "../../utils/api-error.js";
import {
  archiveAssignment,
  createAssignment,
  editAssignment,
  getAssignment,
  getAssignments,
  publishAssignment,
} from "./assignment.service.js";
import {
  createUploadIntent,
  getStudentSubmission,
  saveDraft,
  submitWork,
  teacherSubmissionDetail,
  teacherSubmissions,
} from "../submissions/submission.service.js";
export const assignmentRouter = Router({ mergeParams: true });
assignmentRouter.use(requireAuth, requireClassMembership);
assignmentRouter.get("/", async (req, res, next) => {
  try {
    const q = memberQuerySchema.safeParse(req.query);
    if (!q.success)
      throw new ApiError(400, "VALIDATION_ERROR", "Invalid pagination values.");
    sendData(
      res,
      await getAssignments(
        req.classMembership!.classId,
        req.classMembership!.role === "STUDENT",
        q.data.page,
        q.data.limit,
      ),
    );
  } catch (e) {
    next(e);
  }
});
assignmentRouter.post(
  "/",
  requireCsrf,
  requireClassRole("OWNER", "TEACHER"),
  validateBody(assignmentInputSchema),
  async (req, res, next) => {
    try {
      sendData(
        res,
        await createAssignment(
          req.classMembership!.classId,
          req.principal!.userId,
          req.body,
        ),
        201,
      );
    } catch (e) {
      next(e);
    }
  },
);

assignmentRouter.get(
  "/:assignmentId/submission",
  requireClassRole("STUDENT"),
  async (req, res, next) => {
    try {
      sendData(
        res,
        await getStudentSubmission(
          String(req.params.assignmentId),
          req.classMembership!.classId,
          req.principal!.userId,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);
assignmentRouter.patch(
  "/:assignmentId/submission/draft",
  requireCsrf,
  requireClassRole("STUDENT"),
  validateBody(submissionDraftSchema),
  async (req, res, next) => {
    try {
      sendData(
        res,
        await saveDraft(
          String(req.params.assignmentId),
          req.classMembership!.classId,
          req.principal!.userId,
          req.body,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);
assignmentRouter.post(
  "/:assignmentId/submission/submit",
  requireCsrf,
  requireClassRole("STUDENT"),
  async (req, res, next) => {
    try {
      sendData(
        res,
        await submitWork(
          String(req.params.assignmentId),
          req.classMembership!.classId,
          req.principal!.userId,
        ),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
);
assignmentRouter.post(
  "/:assignmentId/submission/files/intents",
  requireCsrf,
  requireClassRole("STUDENT"),
  validateBody(uploadIntentSchema),
  async (req, res, next) => {
    try {
      sendData(
        res,
        await createUploadIntent(
          String(req.params.assignmentId),
          req.classMembership!.classId,
          req.principal!.userId,
          req.body,
        ),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
);
assignmentRouter.get(
  "/:assignmentId/submissions",
  requireClassRole("OWNER", "TEACHER"),
  async (req, res, next) => {
    try {
      const parsed = submissionQuerySchema.safeParse(req.query);
      if (!parsed.success)
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "Invalid submission filters.",
        );
      const { page, limit, search, filter } = parsed.data;
      sendData(
        res,
        await teacherSubmissions(
          String(req.params.assignmentId),
          req.classMembership!.classId,
          page,
          limit,
          search ?? "",
          filter,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);
assignmentRouter.get(
  "/:assignmentId/submissions/:submissionId",
  requireClassRole("OWNER", "TEACHER"),
  async (req, res, next) => {
    try {
      sendData(
        res,
        await teacherSubmissionDetail(
          String(req.params.submissionId),
          req.classMembership!.classId,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);
assignmentRouter.get("/:assignmentId", async (req, res, next) => {
  try {
    const id = String(req.params.assignmentId);
    if (!mongoose.isObjectIdOrHexString(id))
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Invalid assignment identifier.",
      );
    sendData(
      res,
      await getAssignment(
        id,
        req.classMembership!.classId,
        req.classMembership!.role === "STUDENT",
      ),
    );
  } catch (e) {
    next(e);
  }
});
assignmentRouter.patch(
  "/:assignmentId",
  requireCsrf,
  requireClassRole("OWNER", "TEACHER"),
  validateBody(updateAssignmentSchema),
  async (req, res, next) => {
    try {
      sendData(
        res,
        await editAssignment(
          String(req.params.assignmentId),
          req.classMembership!.classId,
          req.body,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);
assignmentRouter.post(
  "/:assignmentId/publish",
  requireCsrf,
  requireClassRole("OWNER", "TEACHER"),
  async (req, res, next) => {
    try {
      sendData(
        res,
        await publishAssignment(
          String(req.params.assignmentId),
          req.classMembership!.classId,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);
assignmentRouter.post(
  "/:assignmentId/archive",
  requireCsrf,
  requireClassRole("OWNER", "TEACHER"),
  async (req, res, next) => {
    try {
      sendData(
        res,
        await archiveAssignment(
          String(req.params.assignmentId),
          req.classMembership!.classId,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);
