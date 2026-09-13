import request, { type Agent } from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { UserModel } from "./modules/users/user.model.js";
import { SessionModel } from "./modules/auth/session.model.js";
import { ClassModel } from "./modules/classes/class.model.js";
import { ClassMembershipModel } from "./modules/classes/class-membership.model.js";
import { authRateLimit, joinRateLimit } from "./modules/auth/rate-limits.js";
import { ipKeyGenerator } from "express-rate-limit";

let replicaSet: MongoMemoryReplSet;
let sequence = 0;
const origin = "http://localhost:3000";

async function csrf(agent: Agent): Promise<string> {
  const response = await agent.get("/api/v1/auth/csrf");
  return response.body.data.csrfToken as string;
}

async function register(agent: Agent, persona: "TEACHER" | "STUDENT" = "TEACHER", email?: string) {
  const token = await csrf(agent);
  const address = email ?? `person-${sequence += 1}@example.com`;
  const response = await agent.post("/api/v1/auth/register").set("origin", origin).set("x-csrf-token", token).send({ displayName: persona === "TEACHER" ? "Taylor Teacher" : "Sam Student", email: address, password: "correct horse battery staple", primaryPersona: persona });
  return { response, email: address };
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ binary: { version: "8.2.6" }, replSet: { count: 1, storageEngine: "wiredTiger" } });
  await connectDatabase(replicaSet.getUri("eduflux-test"));
  await Promise.all([UserModel.createIndexes(), SessionModel.createIndexes(), ClassModel.createIndexes(), ClassMembershipModel.createIndexes()]);
}, 120_000);

afterEach(async () => { vi.restoreAllMocks(); for (const ip of ["::ffff:127.0.0.1", "::1"]) { const key = ipKeyGenerator(ip); authRateLimit.resetKey(key); joinRateLimit.resetKey(key); } await Promise.all([UserModel.deleteMany({}), SessionModel.deleteMany({}), ClassModel.deleteMany({}), ClassMembershipModel.deleteMany({})]); });
afterAll(async () => { await disconnectDatabase(); await replicaSet.stop(); });

describe("authentication and security", () => {
  it("registers, normalizes email, hashes the password, persists a hashed session, and returns safe data", async () => {
    const agent = request.agent(app);
    const { response } = await register(agent, "TEACHER", "  Mixed.Email@Example.COM ");
    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({ email: "mixed.email@example.com", platformRole: "USER", primaryPersona: "TEACHER" });
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    const cookie = response.headers["set-cookie"]?.[0] as string;
    expect(cookie).toContain("eduflux.sid="); expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("SameSite=Lax"); expect(cookie).toContain("Path=/");
    const user = await UserModel.findOne({ email: "mixed.email@example.com" }).select("+passwordHash +emailCanonical");
    expect(user?.emailCanonical).toBe("mixed.email@example.com"); expect(user?.passwordHash).toMatch(/^\$argon2id\$/); expect(user?.passwordHash).not.toContain("correct horse");
    const storedSession = await SessionModel.findOne({ userId: user?._id }).select("+tokenHash");
    expect(storedSession?.tokenHash).toHaveLength(43); expect(cookie).not.toContain(storedSession?.tokenHash ?? "impossible");
    const session = await agent.get("/api/v1/auth/session"); expect(session.status).toBe(200); expect(session.body.data.user.email).toBe("mixed.email@example.com");
  });

  it("rejects duplicate canonical emails using the unique index", async () => {
    await register(request.agent(app), "TEACHER", "same@example.com");
    const duplicate = await register(request.agent(app), "STUDENT", "SAME@example.com");
    expect(duplicate.response.status).toBe(409); expect(duplicate.response.body.error.code).toBe("EMAIL_ALREADY_REGISTERED"); expect(await UserModel.countDocuments()).toBe(1);
  });

  it("logs in with a generic failure for wrong and unknown credentials", async () => {
    await register(request.agent(app), "TEACHER", "login@example.com");
    for (const [email, password] of [["login@example.com", "wrong-password"], ["unknown@example.com", "wrong-password"]]) {
      const agent = request.agent(app); const token = await csrf(agent); const response = await agent.post("/api/v1/auth/login").set("origin", origin).set("x-csrf-token", token).send({ email, password });
      expect(response.status).toBe(401); expect(response.body.error).toMatchObject({ code: "INVALID_CREDENTIALS", message: "Invalid email or password." });
    }
    const agent = request.agent(app); const token = await csrf(agent); const success = await agent.post("/api/v1/auth/login").set("origin", origin).set("x-csrf-token", token).send({ email: "login@example.com", password: "correct horse battery staple" }); expect(success.status).toBe(200);
  });

  it("requires a matching signed CSRF token and trusted origin", async () => {
    const agent = request.agent(app);
    const missing = await agent.post("/api/v1/auth/register").send({}); expect(missing.status).toBe(403); expect(missing.body.error.code).toBe("CSRF_INVALID");
    const token = await csrf(agent);
    const invalid = await agent.post("/api/v1/auth/register").set("x-csrf-token", `${token}x`).send({}); expect(invalid.status).toBe(403);
    const badOrigin = await agent.post("/api/v1/auth/register").set("origin", "https://evil.example").set("x-csrf-token", token).send({}); expect(badOrigin.status).toBe(403); expect(badOrigin.body.error.code).toBe("ORIGIN_INVALID");
    const valid = await agent.post("/api/v1/auth/register").set("origin", origin).set("x-csrf-token", token).send({ displayName: "Valid User", email: "valid@example.com", password: "correct horse battery staple", primaryPersona: "STUDENT" }); expect(valid.status).toBe(201);
  });

  it("revokes current and all sessions and blocks disabled users", async () => {
    const agent = request.agent(app); const { email } = await register(agent);
    let token = await csrf(agent); expect((await agent.post("/api/v1/auth/logout").set("origin", origin).set("x-csrf-token", token)).status).toBe(200); expect((await agent.get("/api/v1/auth/session")).status).toBe(401);
    token = await csrf(agent); expect((await agent.post("/api/v1/auth/logout").set("origin", origin).set("x-csrf-token", token)).status).toBe(200);
    const first = request.agent(app); token = await csrf(first); await first.post("/api/v1/auth/login").set("origin", origin).set("x-csrf-token", token).send({ email, password: "correct horse battery staple" });
    const second = request.agent(app); token = await csrf(second); await second.post("/api/v1/auth/login").set("origin", origin).set("x-csrf-token", token).send({ email, password: "correct horse battery staple" });
    token = await csrf(first); await first.post("/api/v1/auth/logout-all").set("origin", origin).set("x-csrf-token", token); expect((await second.get("/api/v1/auth/session")).status).toBe(401); expect(await SessionModel.countDocuments()).toBe(0);
    const active = request.agent(app); token = await csrf(active); await active.post("/api/v1/auth/login").set("origin", origin).set("x-csrf-token", token).send({ email, password: "correct horse battery staple" });
    await UserModel.updateOne({ email }, { status: "DISABLED" }); expect((await active.get("/api/v1/auth/session")).status).toBe(401);
  });

  it("rejects an expired server-side session even before TTL cleanup runs", async () => {
    const agent = request.agent(app); await register(agent);
    await SessionModel.updateOne({}, { expiresAt: new Date(Date.now() - 1_000) });
    const response = await agent.get("/api/v1/auth/session");
    expect(response.status).toBe(401); expect(response.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("returns 401 for protected endpoints and rate limits repeated auth attempts", async () => {
    expect((await request(app).get("/api/v1/classes/mine")).status).toBe(401);
    let response; for (let index = 0; index < 55; index += 1) response = await request(app).post("/api/v1/auth/register").send({});
    expect(response?.status).toBe(429); expect(response?.body.error.code).toBe("RATE_LIMITED");
  });
});

describe("classes and membership authorization", () => {
  it("creates a class and its sole owner atomically, then lists it", async () => {
    const teacher = request.agent(app); await register(teacher); const token = await csrf(teacher);
    const created = await teacher.post("/api/v1/classes").set("origin", origin).set("x-csrf-token", token).send({ name: "Literature 10", description: "Close reading" });
    expect(created.status).toBe(201); expect(created.body.data).toMatchObject({ name: "Literature 10", role: "OWNER", memberCount: 1 }); expect(created.body.data.joinCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(await ClassModel.countDocuments()).toBe(1); expect(await ClassMembershipModel.countDocuments({ role: "OWNER" })).toBe(1);
    const mine = await teacher.get("/api/v1/classes/mine"); expect(mine.body.data.classes).toHaveLength(1);
  });

  it("rolls back the class when owner membership creation fails", async () => {
    const teacher = request.agent(app); await register(teacher); const token = await csrf(teacher);
    vi.spyOn(ClassMembershipModel.prototype, "save").mockRejectedValueOnce(new Error("forced owner failure"));
    const response = await teacher.post("/api/v1/classes").set("origin", origin).set("x-csrf-token", token).send({ name: "Must Roll Back" });
    expect(response.status).toBe(500); expect(await ClassModel.countDocuments({ name: "Must Roll Back" })).toBe(0);
  });

  it("joins as STUDENT, prevents duplicates, and blocks member listing", async () => {
    const teacher = request.agent(app); await register(teacher); let token = await csrf(teacher); const created = await teacher.post("/api/v1/classes").set("origin", origin).set("x-csrf-token", token).send({ name: "Physics" });
    const student = request.agent(app); await register(student, "STUDENT"); token = await csrf(student); const joined = await student.post("/api/v1/classes/join").set("origin", origin).set("x-csrf-token", token).send({ joinCode: created.body.data.joinCode });
    expect(joined.status).toBe(201); expect(joined.body.data.role).toBe("STUDENT"); expect(joined.body.data.joinCode).toBeUndefined();
    token = await csrf(student); expect((await student.post("/api/v1/classes/join").set("origin", origin).set("x-csrf-token", token).send({ joinCode: created.body.data.joinCode })).status).toBe(409);
    expect((await student.get(`/api/v1/classes/${created.body.data.id}`)).status).toBe(200); expect((await student.get(`/api/v1/classes/${created.body.data.id}/members`)).status).toBe(403);
    const members = await teacher.get(`/api/v1/classes/${created.body.data.id}/members`); expect(members.status).toBe(200); expect(members.body.data.members).toHaveLength(2); expect(members.body.data.members[1]).not.toHaveProperty("email");
  });

  it("rejects invalid codes, malformed ids, student class creation, and enforces indexes", async () => {
    const student = request.agent(app); await register(student, "STUDENT"); let token = await csrf(student);
    expect((await student.post("/api/v1/classes/join").set("origin", origin).set("x-csrf-token", token).send({ joinCode: "ABCDEFGH" })).status).toBe(404);
    expect((await student.get("/api/v1/classes/not-an-object-id")).status).toBe(400);
    token = await csrf(student); expect((await student.post("/api/v1/classes").set("origin", origin).set("x-csrf-token", token).send({ name: "Escalation" })).status).toBe(403);
    const [userIndexes, sessionIndexes, classIndexes, membershipIndexes] = await Promise.all([UserModel.collection.indexes(), SessionModel.collection.indexes(), ClassModel.collection.indexes(), ClassMembershipModel.collection.indexes()]);
    expect(userIndexes.some((index) => index.name === "user_email_canonical_unique" && index.unique)).toBe(true);
    expect(sessionIndexes.some((index) => index.name === "session_expiry_ttl" && index.expireAfterSeconds === 0)).toBe(true);
    expect(classIndexes.some((index) => index.name === "class_join_code_unique" && index.unique)).toBe(true);
    expect(membershipIndexes.some((index) => index.name === "membership_class_user_unique" && index.unique)).toBe(true);
  });
});
