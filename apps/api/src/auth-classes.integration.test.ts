import request, { type Agent } from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { app } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { UserModel } from "./modules/users/user.model.js";
import { ClassModel } from "./modules/classes/class.model.js";
import { ClassMembershipModel } from "./modules/classes/class-membership.model.js";
import { AssignmentModel } from "./modules/assignments/assignment.model.js";
import { RubricRevisionModel } from "./modules/assignments/rubric-revision.model.js";
import { SubmissionModel } from "./modules/submissions/submission.model.js";
import { SubmissionAttemptModel } from "./modules/submissions/submission-attempt.model.js";
import { SubmissionFileModel } from "./modules/submissions/submission-file.model.js";
import { SubmissionEvaluationModel } from "./modules/submissions/submission-evaluation.model.js";
import { authRateLimit, joinRateLimit } from "./modules/auth/rate-limits.js";
import { ipKeyGenerator } from "express-rate-limit";
let replicaSet: MongoMemoryReplSet;
let sequence = 0;
const origin = "http://localhost:3000";
function token(
  input: Partial<{
    uid: string;
    email: string;
    name: string;
    auth_time: number;
    email_verified: boolean;
    firebase: { sign_in_provider: string };
  }> = {},
) {
  const identity = {
    uid: `uid-${++sequence}`,
    email: `person-${sequence}@example.com`,
    name: "Taylor Teacher",
    auth_time: Math.floor(Date.now() / 1000),
    email_verified: true,
    firebase: { sign_in_provider: "password" },
    ...input,
  };
  return `test-id.${Buffer.from(JSON.stringify(identity)).toString("base64url")}`;
}
async function csrf(agent: Agent) {
  return (await agent.get("/api/v1/auth/csrf")).body.data.csrfToken as string;
}
async function session(
  agent: Agent,
  persona?: "TEACHER" | "STUDENT",
  idToken = token(),
) {
  const csrfToken = await csrf(agent);
  return agent
    .post("/api/v1/auth/session-login")
    .set("origin", origin)
    .set("x-csrf-token", csrfToken)
    .send({ idToken, ...(persona ? { primaryPersona: persona } : {}) });
}
beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    binary: { version: "8.2.6" },
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await connectDatabase(replicaSet.getUri("eduflux-test"));
  await Promise.all([
    UserModel.createIndexes(),
    ClassModel.createIndexes(),
    ClassMembershipModel.createIndexes(),
    AssignmentModel.createIndexes(),
    RubricRevisionModel.createIndexes(),
    SubmissionModel.createIndexes(),
    SubmissionAttemptModel.createIndexes(),
    SubmissionFileModel.createIndexes(),
    SubmissionEvaluationModel.createIndexes(),
  ]);
}, 120_000);
afterEach(async () => {
  vi.restoreAllMocks();
  for (const ip of ["::ffff:127.0.0.1", "::1"]) {
    const key = ipKeyGenerator(ip);
    authRateLimit.resetKey(key);
    joinRateLimit.resetKey(key);
  }
  await Promise.all([
    UserModel.deleteMany({}),
    ClassModel.deleteMany({}),
    ClassMembershipModel.deleteMany({}),
    AssignmentModel.deleteMany({}),
    RubricRevisionModel.deleteMany({}),
    SubmissionModel.deleteMany({}),
    SubmissionAttemptModel.deleteMany({}),
    SubmissionFileModel.deleteMany({}),
    SubmissionEvaluationModel.deleteMany({}),
  ]);
});
afterAll(async () => {
  await disconnectDatabase();
  await replicaSet.stop();
});
describe("Firebase session authentication", () => {
  it("exchanges a recent verified token, upserts a safe user, and sets an HttpOnly cookie", async () => {
    const agent = request.agent(app),
      response = await session(
        agent,
        "TEACHER",
        token({ email: "Mixed.Email@Example.COM" }),
      );
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      requiresOnboarding: false,
      user: {
        firebaseUid: expect.any(String),
        email: "Mixed.Email@Example.COM",
        primaryPersona: "TEACHER",
        platformRole: "USER",
      },
    });
    expect(response.headers["set-cookie"]?.[0]).toContain("eduflux.session=");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    const stored = await UserModel.findOne({});
    expect(stored?.emailCanonical).toBeUndefined();
    expect(
      await UserModel.findOne({ emailCanonical: "mixed.email@example.com" }),
    ).not.toBeNull();
    expect(JSON.stringify(stored)).not.toContain("passwordHash");
    expect((await agent.get("/api/v1/auth/session")).status).toBe(200);
  });
  it("rejects invalid and stale ID tokens and requires CSRF", async () => {
    expect(
      (
        await request(app)
          .post("/api/v1/auth/session-login")
          .send({ idToken: token() })
      ).status,
    ).toBe(403);
    const agent = request.agent(app),
      csrfToken = await csrf(agent);
    expect(
      (
        await agent
          .post("/api/v1/auth/session-login")
          .set("origin", origin)
          .set("x-csrf-token", csrfToken)
          .send({ idToken: "invalid-token-that-is-long-enough" })
      ).status,
    ).toBe(401);
    expect(
      (
        await session(
          request.agent(app),
          "TEACHER",
          token({ auth_time: Math.floor(Date.now() / 1000) - 360 }),
        )
      ).body.error.code,
    ).toBe("AUTH_RECENT_REQUIRED");
  });
  it("reuses Firebase UID without overwriting role and sends Google users to onboarding", async () => {
    const id = token({
      uid: "stable-uid",
      firebase: { sign_in_provider: "google.com" },
    });
    const first = request.agent(app);
    expect(
      (await session(first, undefined, id)).body.data.requiresOnboarding,
    ).toBe(true);
    await UserModel.updateOne(
      { firebaseUid: "stable-uid" },
      { platformRole: "ADMIN" },
    );
    const second = request.agent(app);
    await session(second, "STUDENT", id);
    expect(await UserModel.countDocuments({ firebaseUid: "stable-uid" })).toBe(
      1,
    );
    expect(
      (await UserModel.findOne({ firebaseUid: "stable-uid" }))?.platformRole,
    ).toBe("ADMIN");
  });
  it("supports first-use onboarding, disabled users, logout, and revocation", async () => {
    const agent = request.agent(app),
      id = token({ uid: "lifecycle-uid" });
    await session(agent, undefined, id);
    let csrfToken = await csrf(agent);
    expect(
      (
        await agent
          .post("/api/v1/auth/onboarding")
          .set("origin", origin)
          .set("x-csrf-token", csrfToken)
          .send({ primaryPersona: "STUDENT" })
      ).status,
    ).toBe(200);
    csrfToken = await csrf(agent);
    expect(
      (
        await agent
          .post("/api/v1/auth/logout-all")
          .set("origin", origin)
          .set("x-csrf-token", csrfToken)
      ).status,
    ).toBe(200);
    expect((await agent.get("/api/v1/auth/session")).status).toBe(401);
    const disabled = request.agent(app);
    await UserModel.updateOne(
      { firebaseUid: "lifecycle-uid" },
      { status: "DISABLED" },
    );
    expect((await session(disabled, undefined, id)).status).toBe(403);
  });
});
describe("class membership compatibility", () => {
  it("keeps legacy class documents valid without the new optional fields", async () => {
    await expect(
      new ClassModel({
        name: "Legacy class",
        joinCode: "LEGACY24",
        status: "ACTIVE",
      }).validate(),
    ).resolves.toBeUndefined();
  });
  it("preserves teacher creation, student join, and member authorization", async () => {
    const teacher = request.agent(app);
    await session(teacher, "TEACHER");
    let csrfToken = await csrf(teacher);
    const created = await teacher
      .post("/api/v1/classes")
      .set("origin", origin)
      .set("x-csrf-token", csrfToken)
      .send({
        name: "Literature",
        subjectLevel: "English Literature",
        startDate: "2026-09-20",
        endDate: "2027-05-30",
        description: "Close reading.",
      });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      subjectLevel: "English Literature",
      startDate: "2026-09-20",
      endDate: "2027-05-30",
      role: "OWNER",
      memberCount: 1,
    });
    expect(created.body.data.inviteToken).toEqual(expect.any(String));
    expect(created.body.data.joinUrl).toContain(
      `/join/${created.body.data.inviteToken}`,
    );
    const student = request.agent(app);
    await session(student, "STUDENT");
    csrfToken = await csrf(student);
    expect(
      (
        await student
          .post("/api/v1/classes/join")
          .set("origin", origin)
          .set("x-csrf-token", csrfToken)
          .send({ joinCode: created.body.data.joinCode })
      ).status,
    ).toBe(201);
    const studentRoster = await student.get(
      `/api/v1/classes/${created.body.data.id}/members`,
    );
    expect(studentRoster.status).toBe(200);
    expect(
      studentRoster.body.data.members.every(
        (member: { email?: string }) => !member.email,
      ),
    ).toBe(true);
    expect(
      (await teacher.get(`/api/v1/classes/${created.body.data.id}/members`))
        .body.data.members,
    ).toHaveLength(2);
  });
  it("supports confirmed invite joining, rotation, assignment publishing, and draft privacy", async () => {
    const teacher = request.agent(app);
    await session(teacher, "TEACHER");
    let csrfToken = await csrf(teacher);
    const created = await teacher
      .post("/api/v1/classes")
      .set("origin", origin)
      .set("x-csrf-token", csrfToken)
      .send({
        name: "Writing",
        subjectLevel: "Academic Writing",
        startDate: "2026-09-20",
      });
    const classId = created.body.data.id,
      token = created.body.data.inviteToken;
    expect(
      (await request(app).get(`/api/v1/classes/join/${token}/preview`)).body
        .data,
    ).toMatchObject({ name: "Writing", teacher: { role: "OWNER" } });
    const student = request.agent(app);
    await session(student, "STUDENT");
    csrfToken = await csrf(student);
    expect(
      (
        await student
          .post(`/api/v1/classes/join/${token}`)
          .set("origin", origin)
          .set("x-csrf-token", csrfToken)
      ).status,
    ).toBe(201);
    expect(
      (
        await student
          .post(`/api/v1/classes/join/${token}`)
          .set("origin", origin)
          .set("x-csrf-token", csrfToken)
      ).status,
    ).toBe(201);
    csrfToken = await csrf(teacher);
    const draft = await teacher
      .post(`/api/v1/classes/${classId}/assignments`)
      .set("origin", origin)
      .set("x-csrf-token", csrfToken)
      .send({
        title: "Persuasive essay",
        description: "Write an essay.",
        allowLateSubmission: false,
        allowResubmission: true,
        showMarks: true,
        resourceLinks: [],
      });
    expect(draft.status).toBe(201);
    expect(draft.body.data.status).toBe("DRAFT");
    expect(
      (await student.get(`/api/v1/classes/${classId}/assignments`)).body.data
        .assignments,
    ).toHaveLength(0);
    csrfToken = await csrf(teacher);
    const rejectedPublish = await teacher
      .post(`/api/v1/classes/${classId}/assignments/${draft.body.data.id}/publish`)
      .set("origin", origin)
      .set("x-csrf-token", csrfToken);
    expect(rejectedPublish.status).toBe(400);
    expect(rejectedPublish.body.error.code).toBe("RUBRIC_REQUIRED");
    // Add a rubric before publishing (now required)
    const savedRubric = await teacher
      .put(`/api/v1/classes/${classId}/assignments/${draft.body.data.id}/rubric`)
      .set("origin", origin)
      .set("x-csrf-token", csrfToken)
      .send({
        version: 1,
        title: "Essay Rubric",
        description: "",
        levels: [
          { id: "excellent", label: "Excellent", percentage: 100 },
          { id: "good", label: "Good", percentage: 80 },
          { id: "satisfactory", label: "Satisfactory", percentage: 60 },
          { id: "needs_improvement", label: "Needs Improvement", percentage: 40 },
        ],
        criteria: [
          {
            id: "content",
            title: "Content",
            weight: 50,
            descriptors: ["Excellent content", "Good content", "Satisfactory content", "Needs improvement"],
          },
          {
            id: "organization",
            title: "Organization",
            weight: 50,
            descriptors: ["Excellent organization", "Good organization", "Satisfactory organization", "Needs improvement"],
          },
        ],
      });
    expect(savedRubric.body.data).toMatchObject({ status: "DRAFT", hasRubric: true, rubricRevisionNumber: 1 });
    // Prove publishing reads the canonical immutable revision rather than the transitional embedded copy.
    await AssignmentModel.updateOne({ _id: draft.body.data.id }, { $unset: { rubric: 1 } });
    csrfToken = await csrf(teacher);
    expect(
      (
        await teacher
          .post(
            `/api/v1/classes/${classId}/assignments/${draft.body.data.id}/publish`,
          )
          .set("origin", origin)
          .set("x-csrf-token", csrfToken)
      ).body.data.status,
    ).toBe("PUBLISHED");
    expect(
      (await student.get(`/api/v1/classes/${classId}/assignments`)).body.data
        .assignments,
    ).toHaveLength(1);
    expect((await teacher.get(`/api/v1/classes/${classId}/assignments`)).body.data.assignments[0]).toMatchObject({ status: "PUBLISHED", hasRubric: true, rubricRevisionNumber: 1 });
    const rotated = await teacher
      .post(`/api/v1/classes/${classId}/invite/rotate`)
      .set("origin", origin)
      .set("x-csrf-token", csrfToken);
    expect(rotated.body.data.inviteToken).not.toBe(token);
    expect(
      (await request(app).get(`/api/v1/classes/join/${token}/preview`)).status,
    ).toBe(404);
  });
  it("keeps required indexes and transactional rollback", async () => {
    const teacher = request.agent(app);
    await session(teacher, "TEACHER");
    let csrfToken = await csrf(teacher);
    vi.spyOn(ClassMembershipModel.prototype, "save").mockRejectedValueOnce(
      new Error("forced"),
    );
    expect(
      (
        await teacher
          .post("/api/v1/classes")
          .set("origin", origin)
          .set("x-csrf-token", csrfToken)
          .send({
            name: "Rollback",
            subjectLevel: "General",
            startDate: "2026-09-20",
          })
      ).status,
    ).toBe(500);
    expect(await ClassModel.countDocuments()).toBe(0);
    const indexes = await UserModel.collection.indexes();
    expect(
      indexes.some(
        (index) => index.name === "user_firebase_uid_unique" && index.unique,
      ),
    ).toBe(true);
  });
  it("rejects invalid dates, ownership fields, and student class creation", async () => {
    const teacher = request.agent(app);
    await session(teacher, "TEACHER");
    let csrfToken = await csrf(teacher);
    const invalid = await teacher
      .post("/api/v1/classes")
      .set("origin", origin)
      .set("x-csrf-token", csrfToken)
      .send({
        name: "Literature",
        subjectLevel: "English",
        startDate: "2026-09-20",
        endDate: "2026-09-19",
      });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.fields.endDate).toContain(
      "End date cannot be earlier than start date.",
    );
    const ownership = await teacher
      .post("/api/v1/classes")
      .set("origin", origin)
      .set("x-csrf-token", csrfToken)
      .send({
        name: "Literature",
        subjectLevel: "English",
        startDate: "2026-09-20",
        ownerId: "someone-else",
      });
    expect(ownership.status).toBe(400);
    const student = request.agent(app);
    await session(student, "STUDENT");
    csrfToken = await csrf(student);
    expect(
      (
        await student
          .post("/api/v1/classes")
          .set("origin", origin)
          .set("x-csrf-token", csrfToken)
          .send({
            name: "Literature",
            subjectLevel: "English",
            startDate: "2026-09-20",
          })
      ).status,
    ).toBe(403);
  });
});

describe("rubric revision and assignment safety", () => {
  const rubric = (title = "Essay Rubric") => ({
    version: 1,
    title,
    description: "",
    levels: [
      { id: "excellent", label: "Excellent", percentage: 100 },
      { id: "developing", label: "Developing", percentage: 60 },
    ],
    criteria: [
      {
        id: "argument",
        title: "Argument",
        weight: 100,
        descriptors: ["Clear and well supported", "Still developing"],
      },
    ],
  });

  it("creates immutable revisions, binds attempts, batches summaries, and enforces route/delete safety", async () => {
    const teacher = request.agent(app);
    await session(teacher, "TEACHER");
    let teacherCsrf = await csrf(teacher);
    const createdClass = await teacher
      .post("/api/v1/classes")
      .set("origin", origin)
      .set("x-csrf-token", teacherCsrf)
      .send({ name: "Revision class", subjectLevel: "General", startDate: "2026-09-20" });
    const classId = createdClass.body.data.id as string;

    const student = request.agent(app);
    await session(student, "STUDENT");
    let studentCsrf = await csrf(student);
    await student
      .post("/api/v1/classes/join")
      .set("origin", origin)
      .set("x-csrf-token", studentCsrf)
      .send({ joinCode: createdClass.body.data.joinCode });

    teacherCsrf = await csrf(teacher);
    const assignmentResponse = await teacher
      .post(`/api/v1/classes/${classId}/assignments`)
      .set("origin", origin)
      .set("x-csrf-token", teacherCsrf)
      .send({
        title: "Revision essay",
        availableFrom: new Date(Date.now() - 120_000).toISOString(),
        dueAt: new Date(Date.now() - 60_000).toISOString(),
        allowLateSubmission: true,
        allowResubmission: true,
        maxAttempts: 3,
        showMarks: true,
        resourceLinks: [],
      });
    const assignmentId = assignmentResponse.body.data.id as string;

    const invalidRubric = rubric();
    invalidRubric.criteria[0]!.weight = 90;
    expect(
      (
        await teacher
          .put(`/api/v1/classes/${classId}/assignments/${assignmentId}/rubric`)
          .set("origin", origin)
          .set("x-csrf-token", teacherCsrf)
          .send(invalidRubric)
      ).status,
    ).toBe(400);

    let response = await teacher
      .put(`/api/v1/classes/${classId}/assignments/${assignmentId}/rubric`)
      .set("origin", origin)
      .set("x-csrf-token", teacherCsrf)
      .send(rubric());
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ hasRubric: true, rubricRevisionNumber: 1, maxScore: 100 });
    expect(await RubricRevisionModel.countDocuments({ assignmentId })).toBe(1);

    await teacher
      .put(`/api/v1/classes/${classId}/assignments/${assignmentId}/rubric`)
      .set("origin", origin)
      .set("x-csrf-token", teacherCsrf)
      .send(rubric());
    expect(await RubricRevisionModel.countDocuments({ assignmentId })).toBe(1);

    response = await teacher
      .put(`/api/v1/classes/${classId}/assignments/${assignmentId}/rubric`)
      .set("origin", origin)
      .set("x-csrf-token", teacherCsrf)
      .send(rubric("Revised Essay Rubric"));
    expect(response.body.data.rubricRevisionNumber).toBe(2);
    const revisions = await RubricRevisionModel.find({ assignmentId }).sort({ revisionNumber: 1 }).lean();
    expect(revisions.map((item) => item.rubric.title)).toEqual(["Essay Rubric", "Revised Essay Rubric"]);
    await RubricRevisionModel.updateOne(
      { _id: revisions[0]!._id },
      { $set: { "rubric.title": "Tampered" } },
    );
    expect((await RubricRevisionModel.findById(revisions[0]!._id).lean())?.rubric.title).toBe("Essay Rubric");
    expect((await AssignmentModel.findById(assignmentId))?.currentRubricRevisionId?.toString()).toBe(revisions[1]?._id.toString());
    expect((await teacher.get(`/api/v1/classes/${classId}/assignments/${assignmentId}/rubric`)).body.data).toMatchObject({
      rubric: { title: "Revised Essay Rubric" },
      rubricRevisionNumber: 2,
      locked: false,
    });

    expect(
      (
        await student
          .put(`/api/v1/classes/${classId}/assignments/${assignmentId}/rubric`)
          .set("origin", origin)
          .set("x-csrf-token", studentCsrf)
          .send(rubric("Student edit"))
      ).status,
    ).toBe(403);
    const unrelatedTeacher = request.agent(app);
    await session(unrelatedTeacher, "TEACHER");
    const unrelatedCsrf = await csrf(unrelatedTeacher);
    expect(
      (
        await unrelatedTeacher
          .put(`/api/v1/classes/${classId}/assignments/${assignmentId}/rubric`)
          .set("origin", origin)
          .set("x-csrf-token", unrelatedCsrf)
          .send(rubric("Unrelated edit"))
      ).status,
    ).toBe(404);

    response = await teacher
      .post(`/api/v1/classes/${classId}/assignments/${assignmentId}/publish`)
      .set("origin", origin)
      .set("x-csrf-token", teacherCsrf);
    expect(response.body.data.status).toBe("PUBLISHED");
    const publishedAt = response.body.data.publishedAt;
    response = await teacher
      .post(`/api/v1/classes/${classId}/assignments/${assignmentId}/publish`)
      .set("origin", origin)
      .set("x-csrf-token", teacherCsrf);
    expect(response.body.data.publishedAt).toBe(publishedAt);
    expect(await SubmissionModel.countDocuments()).toBe(0);
    const studentList = await student.get(`/api/v1/classes/${classId}/assignments`);
    expect(studentList.body.data.assignments[0].studentSubmission.submissionState).toBe("NONE");
    expect(studentList.body.data.assignments[0].rubric).toBeUndefined();
    expect(await SubmissionModel.countDocuments()).toBe(0);

    const opened = await student.get(`/api/v1/classes/${classId}/assignments/${assignmentId}/submission`);
    const submissionId = opened.body.data.id as string;
    studentCsrf = await csrf(student);
    await student
      .patch(`/api/v1/classes/${classId}/assignments/${assignmentId}/submission/draft`)
      .set("origin", origin)
      .set("x-csrf-token", studentCsrf)
      .send({ typedText: "My answer", fileIds: [], draftRevision: opened.body.data.draftRevision });
    response = await student
      .post(`/api/v1/classes/${classId}/assignments/${assignmentId}/submission/submit`)
      .set("origin", origin)
      .set("x-csrf-token", studentCsrf);
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      submission: { id: submissionId, status: "SUBMITTED" },
      attempt: { attemptNumber: 1 },
      evaluation: { status: "PENDING" },
    });
    const submittedAttemptId = response.body.data.attempt.id as string;
    const attempt = await SubmissionAttemptModel.findOne({ assignmentId }).lean();
    expect(attempt).toMatchObject({ rubricRevisionNumber: 2, rubricHash: revisions[1]?.rubricHash });
    expect(attempt?.rubricRevisionId?.toString()).toBe(revisions[1]?._id.toString());
    expect(await SubmissionEvaluationModel.findOne({ attemptId: submittedAttemptId }).lean()).toMatchObject({
      submissionId: expect.anything(),
      rubricRevisionNumber: 2,
    });
    expect(
      (
        await student.get(`/api/v1/classes/${classId}/assignments/${assignmentId}/submissions/${submissionId}/attempts/${submittedAttemptId}/review`)
      ).status,
    ).toBe(200);
    expect(
      (
        await teacher.get(`/api/v1/classes/${classId}/assignments/${assignmentId}/submissions/${submissionId}/attempts/${submittedAttemptId}/teacher-review`)
      ).status,
    ).toBe(200);
    const otherStudent = request.agent(app);
    await session(otherStudent, "STUDENT");
    expect(
      (
        await otherStudent.get(`/api/v1/classes/${classId}/assignments/${assignmentId}/submissions/${submissionId}/attempts/${submittedAttemptId}/review`)
      ).status,
    ).toBe(404);
    const secondDraft = await student
      .patch(`/api/v1/classes/${classId}/assignments/${assignmentId}/submission/draft`)
      .set("origin", origin)
      .set("x-csrf-token", studentCsrf)
      .send({ typedText: "My revised answer", fileIds: [], draftRevision: response.body.data.submission.draftRevision });
    expect(secondDraft.status).toBe(200);
    const secondSubmit = await student
      .post(`/api/v1/classes/${classId}/assignments/${assignmentId}/submission/submit`)
      .set("origin", origin)
      .set("x-csrf-token", studentCsrf);
    expect(secondSubmit.body.data.attempt.attemptNumber).toBe(2);
    expect(
      (
        await student.get(`/api/v1/classes/${classId}/assignments/${assignmentId}/submissions/${submissionId}/attempts/${submittedAttemptId}/review`)
      ).body.data.attemptNumber,
    ).toBe(1);
    const teacherReview = await teacher.get(`/api/v1/classes/${classId}/assignments/${assignmentId}/submissions/${submissionId}/review`);
    expect(teacherReview.status).toBe(200);
    expect(teacherReview.body.data).toMatchObject({ submissionId, rubricRevisionNumber: 2, typedText: "My revised answer" });
    const commented = await teacher
      .post(`/api/v1/classes/${classId}/assignments/${assignmentId}/submissions/${submissionId}/comments`)
      .set("origin", origin)
      .set("x-csrf-token", teacherCsrf)
      .send({ comment: "Strong opening; support the conclusion." });
    expect(commented.status).toBe(200);
    expect((await student.get(`/api/v1/classes/${classId}/assignments/${assignmentId}/submission/review`)).body.data.teacherComment).toBe("Strong opening; support the conclusion.");
    expect((await unrelatedTeacher.get(`/api/v1/classes/${classId}/assignments/${assignmentId}/submissions/${submissionId}/review`)).status).toBe(404);

    response = await teacher
      .put(`/api/v1/classes/${classId}/assignments/${assignmentId}/rubric`)
      .set("origin", origin)
      .set("x-csrf-token", teacherCsrf)
      .send(rubric("Locked edit"));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("RUBRIC_LOCKED");

    const teacherList = await teacher.get(`/api/v1/classes/${classId}/assignments`);
    expect(teacherList.body.data.assignments[0].rubric).toBeUndefined();
    expect(teacherList.body.data.assignments[0]).toMatchObject({
      rubricLocked: true,
      submissionStats: { eligibleStudentCount: 1, submittedCount: 1, lateCount: 1 },
    });

    const otherAssignment = await teacher
      .post(`/api/v1/classes/${classId}/assignments`)
      .set("origin", origin)
      .set("x-csrf-token", teacherCsrf)
      .send({ title: "Other assignment", allowLateSubmission: false, allowResubmission: false, showMarks: true, resourceLinks: [] });
    expect(
      (
        await student.get(`/api/v1/classes/${classId}/assignments/${otherAssignment.body.data.id}/submissions/${submissionId}/attempts/${submittedAttemptId}/review`)
      ).status,
    ).toBe(404);
    expect(
      (
        await teacher.get(
          `/api/v1/classes/${classId}/assignments/${otherAssignment.body.data.id}/submissions/${submissionId}`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await teacher.get(
          `/api/v1/classes/${classId}/assignments/${assignmentId}/submissions/${submissionId}`,
        )
      ).status,
    ).toBe(200);

    response = await teacher
      .delete(`/api/v1/classes/${classId}/assignments/${assignmentId}`)
      .set("origin", origin)
      .set("x-csrf-token", teacherCsrf);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ASSIGNMENT_HAS_SUBMISSIONS");
    expect(
      (
        await teacher
          .post(`/api/v1/classes/${classId}/assignments/${assignmentId}/archive`)
          .set("origin", origin)
          .set("x-csrf-token", teacherCsrf)
      ).body.data.status,
    ).toBe("ARCHIVED");
    expect(
      (
        await teacher
          .post(`/api/v1/classes/${classId}/assignments/${assignmentId}/archive`)
          .set("origin", origin)
          .set("x-csrf-token", teacherCsrf)
      ).body.data.status,
    ).toBe("ARCHIVED");

    const studentUser = await UserModel.findOne({ primaryPersona: "STUDENT" }).lean();
    await SubmissionModel.create({
      assignmentId: otherAssignment.body.data.id,
      classId,
      studentUserId: studentUser!._id,
      status: "DRAFT",
      draftText: "",
      draftFileIds: [],
      draftRevision: 0,
      latestAttemptNumber: 0,
    });
    response = await teacher
      .delete(`/api/v1/classes/${classId}/assignments/${otherAssignment.body.data.id}`)
      .set("origin", origin)
      .set("x-csrf-token", teacherCsrf);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ASSIGNMENT_HAS_DRAFTS");

    const emptyAssignment = await teacher
      .post(`/api/v1/classes/${classId}/assignments`)
      .set("origin", origin)
      .set("x-csrf-token", teacherCsrf)
      .send({ title: "Empty assignment", allowLateSubmission: false, allowResubmission: false, showMarks: true, resourceLinks: [] });
    response = await teacher
      .delete(`/api/v1/classes/${classId}/assignments/${emptyAssignment.body.data.id}`)
      .set("origin", origin)
      .set("x-csrf-token", teacherCsrf);
    expect(response.status).toBe(200);
    expect(response.body.data.deleted).toBe(true);
  }, 20_000);
});
