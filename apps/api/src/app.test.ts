import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";

const mongoose = vi.hoisted(() => ({
  connection: { readyState: 0 },
  set: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("mongoose", () => ({
  default: mongoose,
  set: mongoose.set,
  connect: mongoose.connect,
  disconnect: mongoose.disconnect,
}));

const firebaseAdmin = vi.hoisted(() => ({
  apps: [],
  initializeApp: vi.fn(),
  auth: vi.fn(() => ({
    verifyIdToken: vi.fn(),
    createSessionCookie: vi.fn(),
    revokeRefreshTokens: vi.fn(),
  })),
}));

vi.mock("firebase-admin", () => ({
  default: firebaseAdmin,
  getApps: () => firebaseAdmin.apps,
  initializeApp: firebaseAdmin.initializeApp,
  auth: firebaseAdmin.auth,
}));

const env = vi.hoisted(() => ({
  NODE_ENV: "test",
  MONGODB_URI: "mongodb://test:27017/test",
  MONGODB_MAX_POOL_SIZE: 10,
  LOG_LEVEL: "error",
}));

vi.mock("./config/env.js", () => ({ env }));

const googleCredentials = vi.hoisted(() => ({
  source: "test",
  resolvedPath: null,
}));

vi.mock("./config/google-credentials.js", () => ({
  readLocalGoogleCredentialConfig: () => googleCredentials,
  validateCredentialFile: vi.fn(),
}));

const mockIsFirebaseAdminReady = vi.fn(() => true);

vi.mock("./config/firebase-admin.js", () => ({
  isFirebaseAdminReady: mockIsFirebaseAdminReady,
  firebaseAuth: {
    verifyIdToken: vi.fn(),
    createSessionCookie: vi.fn(),
    revokeRefreshTokens: vi.fn(),
  },
}));

const pino = vi.hoisted(() => vi.fn(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})));

vi.mock("pino", () => ({ default: pino }));

describe("GET /health", () => {
  it("returns service health", async () => {
    const app = express();
    app.get("/health", (_request, response) => {
      response.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok" });
    expect(response.body.timestamp).toEqual(expect.any(String));
  });
});

describe("GET /health/live", () => {
  it("returns ok status without waiting for database", async () => {
    const app = express();
    app.get("/health/live", (_request, response) => {
      response.json({ status: "ok" });
    });

    const response = await request(app).get("/health/live");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(mongoose.connect).not.toHaveBeenCalled();
  });
});

describe("GET /health/ready", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mongoose.connection.readyState = 0;
  });

  it("awaits database connection before checking readiness", async () => {
    mongoose.connect.mockImplementationOnce(async () => {
      mongoose.connection.readyState = 1;
      return undefined;
    });

    const { ensureDatabaseConnection, isDatabaseReady } = await import("./config/database.js");
    const { isFirebaseAdminReady } = await import("./config/firebase-admin.js");

    const app = express();
    app.get("/health/ready", async (_request, response) => {
      try {
        await ensureDatabaseConnection();
      } catch (error) {
        response.status(503).json({ status: "unavailable" });
        return;
      }

      const dbReady = isDatabaseReady();
      const firebaseReady = isFirebaseAdminReady();

      if (!dbReady || !firebaseReady) {
        response.status(503).json({ status: "unavailable" });
        return;
      }

      response.json({ status: "ok" });
    });

    const response = await request(app).get("/health/ready");

    expect(mongoose.connect).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("returns 503 when database connection fails", async () => {
    const error = new Error("Connection failed");
    mongoose.connect.mockRejectedValueOnce(error);

    const { ensureDatabaseConnection } = await import("./config/database.js");

    const app = express();
    app.get("/health/ready", async (_request, response) => {
      try {
        await ensureDatabaseConnection();
      } catch (error) {
        response.status(503).json({ status: "unavailable" });
        return;
      }

      response.json({ status: "ok" });
    });

    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "unavailable" });
  });

  it("returns 503 when Firebase is not ready", async () => {
    mongoose.connect.mockResolvedValueOnce(undefined);
    mockIsFirebaseAdminReady.mockReturnValueOnce(false);

    const { ensureDatabaseConnection, isDatabaseReady } = await import("./config/database.js");
    const { isFirebaseAdminReady } = await import("./config/firebase-admin.js");

    const app = express();
    app.get("/health/ready", async (_request, response) => {
      try {
        await ensureDatabaseConnection();
      } catch (error) {
        response.status(503).json({ status: "unavailable" });
        return;
      }

      const dbReady = isDatabaseReady();
      const firebaseReady = isFirebaseAdminReady();

      if (!dbReady || !firebaseReady) {
        response.status(503).json({ status: "unavailable" });
        return;
      }

      response.json({ status: "ok" });
    });

    const response = await request(app).get("/health/ready");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "unavailable" });

    mockIsFirebaseAdminReady.mockReturnValue(true);
  });

  it("concurrent ready checks share one connection attempt", async () => {
    mongoose.connect.mockImplementationOnce(async () => {
      mongoose.connection.readyState = 1;
      return undefined;
    });

    const { ensureDatabaseConnection, isDatabaseReady } = await import("./config/database.js");
    const { isFirebaseAdminReady } = await import("./config/firebase-admin.js");

    const app = express();
    app.get("/health/ready", async (_request, response) => {
      try {
        await ensureDatabaseConnection();
      } catch (error) {
        response.status(503).json({ status: "unavailable" });
        return;
      }

      const dbReady = isDatabaseReady();
      const firebaseReady = isFirebaseAdminReady();

      if (!dbReady || !firebaseReady) {
        response.status(503).json({ status: "unavailable" });
        return;
      }

      response.json({ status: "ok" });
    });

    const [response1, response2, response3] = await Promise.all([
      request(app).get("/health/ready"),
      request(app).get("/health/ready"),
      request(app).get("/health/ready"),
    ]);

    expect(mongoose.connect).toHaveBeenCalled();
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(response3.status).toBe(200);
  });

  it("already-connected path does not reconnect", async () => {
    mongoose.connection.readyState = 1;

    const { ensureDatabaseConnection, isDatabaseReady } = await import("./config/database.js");
    const { isFirebaseAdminReady } = await import("./config/firebase-admin.js");

    const app = express();
    app.get("/health/ready", async (_request, response) => {
      try {
        await ensureDatabaseConnection();
      } catch (error) {
        response.status(503).json({ status: "unavailable" });
        return;
      }

      const dbReady = isDatabaseReady();
      const firebaseReady = isFirebaseAdminReady();

      if (!dbReady || !firebaseReady) {
        response.status(503).json({ status: "unavailable" });
        return;
      }

      response.json({ status: "ok" });
    });

    const response = await request(app).get("/health/ready");

    expect(mongoose.connect).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
