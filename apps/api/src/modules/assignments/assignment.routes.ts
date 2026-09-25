import { Router } from "express";
import mongoose from "mongoose";
import {
  assignmentInputSchema,
  memberQuerySchema,
  rubricGenerateSchema,
  rubricSchema,
  submissionDraftSchema,
  submissionFileOrderSchema,
  submissionQuerySchema,
  updateAssignmentSchema,
  uploadIntentSchema,
  teacherCommentSchema,
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
  deleteAssignment,
  editAssignment,
  getAssignment,
  getAssignments,
  mapAssignmentDto,
  publishAssignment,
} from "./assignment.service.js";
import {
  createUploadIntent,
  getStudentSubmission,
  saveDraft,
  reorderDraftFiles,
  submitWork,
  teacherSubmissionDetail,
  teacherSubmissions,
} from "../submissions/submission.service.js";
import {
  saveTeacherComment,
  retryStudentAttemptReview,
  studentAttemptReview,
  studentAttemptReviewStatus,
  studentReview,
  teacherAttemptReview,
  teacherReview,
  teacherReviewStatus,
} from "../submissions/submission-review.service.js";
import { generateRubricWithAI } from "./rubric-ai.service.js";
import { saveRubric, getRubricWithLockStatus } from "./rubric.service.js";
import { rubricAiRateLimit } from "../auth/rate-limits.js";
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
        req.principal!.userId,
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
assignmentRouter.get(
  "/:assignmentId/submission/review",
  requireClassRole("STUDENT"),
  async (req, res, next) => {
    try {
      sendData(
        res,
        await studentReview(
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
assignmentRouter.get(
  "/:assignmentId/submissions/:submissionId/attempts/:attemptId/review/status",
  requireClassRole("STUDENT"),
  async (req, res, next) => {
    try {
      sendData(
        res,
        await studentAttemptReviewStatus(
          String(req.params.submissionId),
          String(req.params.attemptId),
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
assignmentRouter.post(
  "/:assignmentId/submissions/:submissionId/attempts/:attemptId/review/retry",
  requireCsrf,
  requireClassRole("STUDENT"),
  async (req, res, next) => {
    try {
      sendData(
        res,
        await retryStudentAttemptReview(
          String(req.params.submissionId),
          String(req.params.attemptId),
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
assignmentRouter.get(
  "/:assignmentId/submissions/:submissionId/attempts/:attemptId/review",
  requireClassRole("STUDENT"),
  async (req, res, next) => {
    try {
      sendData(
        res,
        await studentAttemptReview(
          String(req.params.submissionId),
          String(req.params.attemptId),
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
assignmentRouter.patch(
  "/:assignmentId/submission/files/order",
  requireCsrf,
  requireClassRole("STUDENT"),
  validateBody(submissionFileOrderSchema),
  async (req, res, next) => {
    try {
      sendData(
        res,
        await reorderDraftFiles(
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
          String(req.params.assignmentId),
          req.classMembership!.classId,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);
assignmentRouter.get(
  "/:assignmentId/submissions/:submissionId/review/status",
  requireClassRole("OWNER", "TEACHER"),
  async (req, res, next) => {
    try {
      sendData(
        res,
        await teacherReviewStatus(
          String(req.params.submissionId),
          String(req.params.assignmentId),
          req.classMembership!.classId,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);
assignmentRouter.get(
  "/:assignmentId/submissions/:submissionId/review",
  requireClassRole("OWNER", "TEACHER"),
  async (req, res, next) => {
    try {
      sendData(
        res,
        await teacherReview(
          String(req.params.submissionId),
          String(req.params.assignmentId),
          req.classMembership!.classId,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);
assignmentRouter.get(
  "/:assignmentId/submissions/:submissionId/attempts/:attemptId/teacher-review",
  requireClassRole("OWNER", "TEACHER"),
  async (req, res, next) => {
    try {
      sendData(
        res,
        await teacherAttemptReview(
          String(req.params.submissionId),
          String(req.params.attemptId),
          String(req.params.assignmentId),
          req.classMembership!.classId,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);
assignmentRouter.post(
  "/:assignmentId/submissions/:submissionId/comments",
  requireCsrf,
  requireClassRole("OWNER", "TEACHER"),
  validateBody(teacherCommentSchema),
  async (req, res, next) => {
    try {
      sendData(
        res,
        await saveTeacherComment(
          String(req.params.submissionId),
          String(req.params.assignmentId),
          req.classMembership!.classId,
          req.body.comment,
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
          req.principal!.userId,
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
          req.principal!.userId,
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
assignmentRouter.delete(
  "/:assignmentId",
  requireCsrf,
  requireClassRole("OWNER", "TEACHER"),
  async (req, res, next) => {
    try {
      sendData(
        res,
        await deleteAssignment(
          String(req.params.assignmentId),
          req.classMembership!.classId,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

// Rubric endpoints
assignmentRouter.get("/:assignmentId/rubric", async (req, res, next) => {
  try {
    const result = await getRubricWithLockStatus(
      String(req.params.assignmentId),
      req.classMembership!.classId,
    );
    sendData(res, result);
  } catch (e) {
    next(e);
  }
});

assignmentRouter.put(
  "/:assignmentId/rubric",
  requireCsrf,
  requireClassRole("OWNER", "TEACHER"),
  validateBody(rubricSchema),
  async (req, res, next) => {
    try {
      const updated = await saveRubric(
        String(req.params.assignmentId),
        req.classMembership!.classId,
        req.principal!.userId,
        req.body,
      );
      sendData(res, mapAssignmentDto(updated, { rubricLocked: false }));
    } catch (e) {
      next(e);
    }
  },
);

assignmentRouter.post(
  "/:assignmentId/rubric/generate",
  requireCsrf,
  requireClassRole("OWNER", "TEACHER"),
  rubricAiRateLimit,
  validateBody(rubricGenerateSchema),
  async (req, res, next) => {
    try {
      const rubricDraft = await generateRubricWithAI(
        String(req.params.assignmentId),
        req.classMembership!.classId,
        req.body.prompt,
      );
      sendData(res, rubricDraft);
    } catch (e) {
      next(e);
    }
  },
);
