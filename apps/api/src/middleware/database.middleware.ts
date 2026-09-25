import { ensureDatabaseConnection } from "../config/database.js";
import type { Request, Response, NextFunction } from "express";

export async function requireDatabase(
  _request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await ensureDatabaseConnection();
    next();
  } catch (error) {
    next(error);
  }
}
