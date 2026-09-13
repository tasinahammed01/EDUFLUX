import { Router } from "express";
import { createClassSchema, joinClassSchema, memberQuerySchema } from "@eduflux/validation";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireCsrf } from "../auth/csrf.middleware.js";
import { joinRateLimit } from "../auth/rate-limits.js";
import { validateBody } from "../../middleware/validate.js";
import { sendData } from "../../utils/respond.js";
import { createClass, getClassForMember, joinClass, listMyClasses } from "./class.service.js";
import { requireClassMembership, requireClassRole } from "./class.middleware.js";
import { countActiveMembers, listMembers } from "./class.repository.js";
import { ApiError } from "../../utils/api-error.js";

export const classRouter = Router();
classRouter.use(requireAuth);
classRouter.post("/", requireCsrf, validateBody(createClassSchema), async (request, response, next) => { try { sendData(response, await createClass(request.body, request.principal!.userId, request.principal!.primaryPersona), 201); } catch (error) { next(error); } });
classRouter.get("/mine", async (request, response, next) => { try { sendData(response, { classes: await listMyClasses(request.principal!.userId) }); } catch (error) { next(error); } });
classRouter.post("/join", joinRateLimit, requireCsrf, validateBody(joinClassSchema), async (request, response, next) => { try { sendData(response, await joinClass(request.body, request.principal!.userId), 201); } catch (error) { next(error); } });
classRouter.get("/:classId", requireClassMembership, async (request, response, next) => { try { sendData(response, await getClassForMember(request.classMembership!.classId, request.principal!.userId)); } catch (error) { next(error); } });
classRouter.get("/:classId/members", requireClassMembership, requireClassRole("OWNER", "TEACHER"), async (request, response, next) => {
  try { const query = memberQuerySchema.safeParse(request.query); if (!query.success) return next(new ApiError(400, "VALIDATION_ERROR", "Invalid pagination values.")); const { page, limit } = query.data; const classId = request.classMembership!.classId; const [members, total] = await Promise.all([listMembers(classId, (page - 1) * limit, limit), countActiveMembers(classId)]); sendData(response, { members: members.map((member) => ({ userId: member.userId.toString(), displayName: member.displayName, role: member.role, joinedAt: member.joinedAt.toISOString() })), page, limit, total }); } catch (error) { next(error); }
});
