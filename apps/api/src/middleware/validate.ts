import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { ApiError } from "../utils/api-error.js";

export function validateBody<T>(schema: ZodType<T>) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      const fields: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".") || "form";
        (fields[key] ??= []).push(issue.message);
      }
      next(new ApiError(400, "VALIDATION_ERROR", "Please check the submitted fields.", fields));
      return;
    }
    request.body = result.data;
    next();
  };
}
