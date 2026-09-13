import { Router } from "express";
import { loginSchema, registerSchema } from "@eduflux/validation";
import { validateBody } from "../../middleware/validate.js";
import { sendData } from "../../utils/respond.js";
import { findActiveUserById } from "../users/user.repository.js";
import { mapUserToPublicUser } from "../users/user.mapper.js";
import { login, logout, logoutAll, register } from "./auth.service.js";
import { requireAuth } from "./auth.middleware.js";
import { issueCsrfToken, requireCsrf } from "./csrf.middleware.js";
import { authRateLimit } from "./rate-limits.js";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "./session-cookie.js";

export const authRouter = Router();
authRouter.get("/csrf", issueCsrfToken);
authRouter.post("/register", authRateLimit, requireCsrf, validateBody(registerSchema), async (request, response, next) => {
  try { const userAgent = request.get("user-agent"); const result = await register(request.body, { ip: request.ip ?? "unknown", ...(userAgent ? { userAgent } : {}) }); setSessionCookie(response, result.sessionToken); sendData(response, { user: result.user }, 201); } catch (error) { next(error); }
});
authRouter.post("/login", authRateLimit, requireCsrf, validateBody(loginSchema), async (request, response, next) => {
  try { const userAgent = request.get("user-agent"); const result = await login(request.body, { ip: request.ip ?? "unknown", ...(userAgent ? { userAgent } : {}) }); setSessionCookie(response, result.sessionToken); sendData(response, { user: result.user }); } catch (error) { next(error); }
});
authRouter.get("/session", requireAuth, async (request, response, next) => {
  try { const user = await findActiveUserById(request.principal!.userId); if (!user) { clearSessionCookie(response); return next(new Error("Authenticated user missing")); } sendData(response, { user: mapUserToPublicUser(user) }); } catch (error) { next(error); }
});
authRouter.post("/logout", requireCsrf, async (request, response, next) => {
  try { await logout(readSessionToken(request)); clearSessionCookie(response); sendData(response, { success: true }); } catch (error) { next(error); }
});
authRouter.post("/logout-all", requireCsrf, requireAuth, async (request, response, next) => {
  try { await logoutAll(request.principal!.userId); clearSessionCookie(response); sendData(response, { success: true }); } catch (error) { next(error); }
});
