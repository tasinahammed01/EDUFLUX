import type { Response } from "express";
import type { ApiSuccess } from "@eduflux/shared-types";

export function sendData<T>(response: Response, data: T, status = 200): void {
  const body: ApiSuccess<T> = { data, error: null };
  response.status(status).json(body);
}
