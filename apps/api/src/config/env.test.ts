import { afterEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";

const originalEnv = { ...process.env };

function setEnvironment(overrides: Record<string, string | undefined>) {
  process.env = {
    ...originalEnv,
    NODE_ENV: "development",
    OCR_PROVIDER: "openai",
    MONGODB_URI: "mongodb://127.0.0.1:27017/eduflux-test",
    CSRF_SECRET: "test-csrf-secret-at-least-32-characters"
  };
  for (const key of ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "GOOGLE_APPLICATION_CREDENTIALS"]) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function loadEnv() {
  vi.resetModules();
  return (await import("./env.js")).env;
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("Firebase credential validation", () => {
  it("prefers complete explicit credentials without validating an unrelated ADC path", async () => {
    setEnvironment({
      FIREBASE_PROJECT_ID: "eduflux-project",
      FIREBASE_CLIENT_EMAIL: "firebase@example.com",
      FIREBASE_PRIVATE_KEY: "private-key",
      GOOGLE_APPLICATION_CREDENTIALS: "nonexistent-unrelated-credentials.json"
    });

    await expect(loadEnv()).resolves.toMatchObject({ FIREBASE_PROJECT_ID: "eduflux-project" });
  });

  it("rejects partially configured explicit credentials", async () => {
    setEnvironment({
      FIREBASE_PROJECT_ID: "eduflux-project",
      FIREBASE_CLIENT_EMAIL: "firebase@example.com"
    });

    await expect(loadEnv()).rejects.toThrow(
      "FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY must all be configured together."
    );
  });

  it("accepts an existing ADC credentials path when explicit credentials are absent", async () => {
    setEnvironment({ GOOGLE_APPLICATION_CREDENTIALS: fileURLToPath(new URL("../../package.json", import.meta.url)) });

    await expect(loadEnv()).resolves.toMatchObject({ NODE_ENV: "development" });
  });

  it("rejects a nonexistent ADC credentials path when explicit credentials are absent", async () => {
    setEnvironment({ GOOGLE_APPLICATION_CREDENTIALS: "nonexistent-adc-credentials.json" });

    await expect(loadEnv()).rejects.toThrow("The configured Google application credentials file does not exist.");
  });

  it("does not require or inspect Firebase credentials in test mode", async () => {
    setEnvironment({
      NODE_ENV: "test",
      GOOGLE_APPLICATION_CREDENTIALS: "nonexistent-test-credentials.json"
    });

    await expect(loadEnv()).resolves.toMatchObject({ NODE_ENV: "test" });
  });
});
