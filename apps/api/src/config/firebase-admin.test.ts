import { afterEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  applicationDefault: vi.fn(() => ({ source: "adc" })),
  cert: vi.fn(() => ({ source: "explicit" })),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({ name: "test-app" })),
  getAuth: vi.fn(() => ({
    verifyIdToken: vi.fn(),
    createSessionCookie: vi.fn(),
    verifySessionCookie: vi.fn(),
    revokeRefreshTokens: vi.fn()
  }))
}));

vi.mock("firebase-admin/app", () => ({
  applicationDefault: firebase.applicationDefault,
  cert: firebase.cert,
  getApps: firebase.getApps,
  initializeApp: firebase.initializeApp
}));
vi.mock("firebase-admin/auth", () => ({ getAuth: firebase.getAuth }));

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
  vi.resetModules();
});

describe("Firebase Admin credential selection", () => {
  it("uses cert for complete explicit credentials even when the unrelated ADC path is invalid", async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      OCR_PROVIDER: "openai",
      MONGODB_URI: "mongodb://127.0.0.1:27017/eduflux-test",
      CSRF_SECRET: "test-csrf-secret-at-least-32-characters",
      FIREBASE_PROJECT_ID: "eduflux-project",
      FIREBASE_CLIENT_EMAIL: "firebase@example.com",
      FIREBASE_PRIVATE_KEY: "private-key",
      GOOGLE_APPLICATION_CREDENTIALS: "nonexistent-unrelated-credentials.json"
    };

    await import("./firebase-admin.js");

    expect(firebase.cert).toHaveBeenCalledOnce();
    expect(firebase.applicationDefault).not.toHaveBeenCalled();
    expect(firebase.initializeApp).toHaveBeenCalledWith(expect.objectContaining({ credential: { source: "explicit" } }));
  });
});
