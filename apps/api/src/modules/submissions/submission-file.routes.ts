import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireCsrf } from "../auth/csrf.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import { sendData } from "../../utils/respond.js";
import { fileContent, finalizeFile, removeFile } from "./submission.service.js";

export const submissionFileRouter = Router();
submissionFileRouter.use(requireAuth);

function fileId(value: string) {
  if (!mongoose.isObjectIdOrHexString(value))
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid file identifier.");
  return value;
}

submissionFileRouter.post(
  "/:fileId/finalize",
  requireCsrf,
  async (req, res, next) => {
    try {
      sendData(
        res,
        await finalizeFile(
          fileId(String(req.params.fileId)),
          req.principal!.userId,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);
submissionFileRouter.delete("/:fileId", requireCsrf, async (req, res, next) => {
  try {
    sendData(
      res,
      await removeFile(
        fileId(String(req.params.fileId)),
        req.principal!.userId,
      ),
    );
  } catch (error) {
    next(error);
  }
});
submissionFileRouter.get("/:fileId/content", async (req, res, next) => {
  try {
    const disposition =
      req.query.disposition === "inline" ? "inline" : "attachment";
    sendData(res, {
      url: await fileContent(
        fileId(String(req.params.fileId)),
        req.principal!.userId,
        disposition,
      ),
    });
  } catch (error) {
    next(error);
  }
});
