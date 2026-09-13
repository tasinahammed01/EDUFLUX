import type { ErrorRequestHandler } from "express";
import { env } from "../config/env.js";
import { ApiError } from "../utils/api-error.js";

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ApiError) {
    response.status(error.status).json({ data: null, error: { code: error.code, message: error.message, requestId: response.getHeader("x-request-id"), ...(error.fields ? { fields: error.fields } : {}) } });
    return;
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  response.req.log.error({ err: error }, "Unhandled request error");
  response.status(500).json({ data: null, error: { code: "INTERNAL_ERROR", message: "Something went wrong.", requestId: response.getHeader("x-request-id"), ...(env.NODE_ENV === "development" ? { detail: message } : {}) } });
};
