import type { CookieOptions, Request, Response } from "express";
import { env } from "../../config/env.js";

export const SESSION_COOKIE_NAME = env.NODE_ENV === "production" ? "__Host-eduflux.sid" : "eduflux.sid";
export const CSRF_COOKIE_NAME = env.NODE_ENV === "production" ? "__Host-eduflux.csrf" : "eduflux.csrf";

const baseCookieOptions: CookieOptions = { secure: env.NODE_ENV === "production", sameSite: "lax", path: "/" };
export const sessionCookieOptions: CookieOptions = { ...baseCookieOptions, httpOnly: true, maxAge: env.SESSION_TTL_DAYS * 86_400_000 };
export const csrfCookieOptions: CookieOptions = { ...baseCookieOptions, httpOnly: true, maxAge: 60 * 60_000 };

export function readSessionToken(request: Request): string | undefined { return request.cookies[SESSION_COOKIE_NAME] as string | undefined; }
export function setSessionCookie(response: Response, token: string): void { response.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions); }
export function clearSessionCookie(response: Response): void { response.clearCookie(SESSION_COOKIE_NAME, baseCookieOptions); }
