import type {CookieOptions,Request,Response} from "express";import {env} from "../../config/env.js";
export const SESSION_COOKIE_NAME=env.NODE_ENV==="production"?"__Host-eduflux.session":"eduflux.session";
export const CSRF_COOKIE_NAME=env.NODE_ENV==="production"?"__Host-eduflux.csrf":"eduflux.csrf";
const base:CookieOptions={secure:env.NODE_ENV==="production",sameSite:"lax",path:"/"};
export const sessionCookieOptions:CookieOptions={...base,httpOnly:true,maxAge:env.FIREBASE_SESSION_TTL_DAYS*86_400_000};
export const csrfCookieOptions:CookieOptions={...base,httpOnly:true,maxAge:60*60_000};
export function readSessionCookie(request:Request){return request.cookies[SESSION_COOKIE_NAME] as string|undefined}
export function setSessionCookie(response:Response,cookie:string){response.cookie(SESSION_COOKIE_NAME,cookie,sessionCookieOptions)}
export function clearSessionCookie(response:Response){response.clearCookie(SESSION_COOKIE_NAME,base)}
