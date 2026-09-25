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
  for (const key of ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLOUD_CREDENTIALS_JSON", "GOOGLE_CLOUD_KEY_FILE"]) {
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

describe("Provider-specific credential validation", () => {
  it("requires OPENROUTER_API_KEY when AI_PROVIDER is openrouter", async () => {
    setEnvironment({
      AI_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: undefined
    });

    await expect(loadEnv()).rejects.toThrow("OPENROUTER_API_KEY is required when AI_PROVIDER=openrouter.");
  });

  it("accepts OPENROUTER_API_KEY when AI_PROVIDER is openrouter", async () => {
    setEnvironment({
      AI_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "sk-or-v1-1234567890123456789012345678901234567890",
      FIREBASE_PROJECT_ID: "test-project",
      FIREBASE_CLIENT_EMAIL: "test@example.com",
      FIREBASE_PRIVATE_KEY: "private-key"
    });

    await expect(loadEnv()).resolves.toMatchObject({ AI_PROVIDER: "openrouter" });
  });

  it("rejects AI_API_KEY when AI_PROVIDER is openrouter", async () => {
    setEnvironment({
      AI_PROVIDER: "openrouter",
      OPENROUTER_API_KEY: "sk-or-123",
      AI_API_KEY: "sk-123"
    });

    await expect(loadEnv()).rejects.toThrow("Use OPENROUTER_API_KEY instead of AI_API_KEY when AI_PROVIDER=openrouter.");
  });

  it("does not require OCR_API_KEY when OCR_PROVIDER is google-vision", async () => {
    setEnvironment({
      OCR_PROVIDER: "google-vision",
      GOOGLE_APPLICATION_CREDENTIALS: fileURLToPath(new URL("../../package.json", import.meta.url)),
      OCR_API_KEY: undefined
    });

    await expect(loadEnv()).resolves.toMatchObject({ OCR_PROVIDER: "google-vision" });
  });

  it("does not require OCR_MODEL when OCR_PROVIDER is google-vision", async () => {
    setEnvironment({
      OCR_PROVIDER: "google-vision",
      GOOGLE_APPLICATION_CREDENTIALS: fileURLToPath(new URL("../../package.json", import.meta.url)),
      OCR_MODEL: undefined
    });

    await expect(loadEnv()).resolves.toMatchObject({ OCR_PROVIDER: "google-vision" });
  });

  it("requires GOOGLE_CLOUD_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS when OCR_PROVIDER is google-vision", async () => {
    setEnvironment({
      OCR_PROVIDER: "google-vision",
      GOOGLE_APPLICATION_CREDENTIALS: undefined,
      GOOGLE_CLOUD_CREDENTIALS_JSON: undefined
    });

    await expect(loadEnv()).rejects.toThrow("GOOGLE_CLOUD_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS is required when OCR_PROVIDER=google-vision.");
  });

  it("accepts GOOGLE_CLOUD_CREDENTIALS_JSON when OCR_PROVIDER is google-vision", async () => {
    setEnvironment({
      OCR_PROVIDER: "google-vision",
      GOOGLE_CLOUD_CREDENTIALS_JSON: '{"client_email":"test@example.com","private_key":"key","project_id":"test"}',
      GOOGLE_APPLICATION_CREDENTIALS: undefined,
      FIREBASE_PROJECT_ID: "test-project",
      FIREBASE_CLIENT_EMAIL: "test@example.com",
      FIREBASE_PRIVATE_KEY: "private-key"
    });

    await expect(loadEnv()).resolves.toMatchObject({ OCR_PROVIDER: "google-vision" });
  });

  it("prefers GOOGLE_CLOUD_CREDENTIALS_JSON over GOOGLE_APPLICATION_CREDENTIALS", async () => {
    setEnvironment({
      OCR_PROVIDER: "google-vision",
      GOOGLE_CLOUD_CREDENTIALS_JSON: '{"client_email":"test@example.com","private_key":"key","project_id":"test"}',
      GOOGLE_APPLICATION_CREDENTIALS: "nonexistent.json",
      FIREBASE_PROJECT_ID: "test-project",
      FIREBASE_CLIENT_EMAIL: "test@example.com",
      FIREBASE_PRIVATE_KEY: "private-key"
    });

    await expect(loadEnv()).resolves.toMatchObject({ OCR_PROVIDER: "google-vision" });
  });

  it("JSON credentials do not trigger file-path validation", async () => {
    setEnvironment({
      OCR_PROVIDER: "google-vision",
      GOOGLE_CLOUD_CREDENTIALS_JSON: '{"client_email":"test@example.com","private_key":"-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----","project_id":"test-project"}',
      GOOGLE_APPLICATION_CREDENTIALS: undefined,
      FIREBASE_PROJECT_ID: "test-project",
      FIREBASE_CLIENT_EMAIL: "test@example.com",
      FIREBASE_PRIVATE_KEY: "private-key"
    });

    await expect(loadEnv()).resolves.toMatchObject({ OCR_PROVIDER: "google-vision" });
  });

  it("JSON credentials take precedence when both are supplied", async () => {
    setEnvironment({
      OCR_PROVIDER: "google-vision",
      GOOGLE_CLOUD_CREDENTIALS_JSON: '{"client_email":"test@example.com","private_key":"-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----","project_id":"test-project"}',
      GOOGLE_APPLICATION_CREDENTIALS: fileURLToPath(new URL("../../package.json", import.meta.url)),
      FIREBASE_PROJECT_ID: "test-project",
      FIREBASE_CLIENT_EMAIL: "test@example.com",
      FIREBASE_PRIVATE_KEY: "private-key"
    });

    await expect(loadEnv()).resolves.toMatchObject({ OCR_PROVIDER: "google-vision" });
  });

  it("malformed JSON fails safely", async () => {
    setEnvironment({
      OCR_PROVIDER: "google-vision",
      GOOGLE_CLOUD_CREDENTIALS_JSON: "invalid-json{",
      GOOGLE_APPLICATION_CREDENTIALS: undefined,
      FIREBASE_PROJECT_ID: "test-project",
      FIREBASE_CLIENT_EMAIL: "test@example.com",
      FIREBASE_PRIVATE_KEY: "private-key"
    });

    await expect(loadEnv()).rejects.toThrow("GOOGLE_CLOUD_CREDENTIALS_JSON is not valid JSON");
  });

  it("missing required fields in JSON fails safely", async () => {
    setEnvironment({
      OCR_PROVIDER: "google-vision",
      GOOGLE_CLOUD_CREDENTIALS_JSON: '{"client_email":"test@example.com","project_id":"test-project"}',
      GOOGLE_APPLICATION_CREDENTIALS: undefined,
      FIREBASE_PROJECT_ID: "test-project",
      FIREBASE_CLIENT_EMAIL: "test@example.com",
      FIREBASE_PRIVATE_KEY: "private-key"
    });

    await expect(loadEnv()).rejects.toThrow("GOOGLE_CLOUD_CREDENTIALS_JSON is missing required fields: client_email, private_key, or project_id");
  });

  it("escaped newlines in private key are normalized", async () => {
    setEnvironment({
      OCR_PROVIDER: "google-vision",
      GOOGLE_CLOUD_CREDENTIALS_JSON: '{"client_email":"test@example.com","private_key":"-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----","project_id":"test-project"}',
      GOOGLE_APPLICATION_CREDENTIALS: undefined,
      FIREBASE_PROJECT_ID: "test-project",
      FIREBASE_CLIENT_EMAIL: "test@example.com",
      FIREBASE_PRIVATE_KEY: "private-key"
    });

    await expect(loadEnv()).resolves.toMatchObject({ OCR_PROVIDER: "google-vision" });
  });

  it("non-google OCR mode does not require Google credentials", async () => {
    setEnvironment({
      OCR_PROVIDER: "openai",
      OCR_API_KEY: "sk-test-key-minimum-20-chars",
      GOOGLE_CLOUD_CREDENTIALS_JSON: undefined,
      GOOGLE_APPLICATION_CREDENTIALS: undefined,
      FIREBASE_PROJECT_ID: "test-project",
      FIREBASE_CLIENT_EMAIL: "test@example.com",
      FIREBASE_PRIVATE_KEY: "private-key"
    });

    await expect(loadEnv()).resolves.toMatchObject({ OCR_PROVIDER: "openai" });
  });

  it("GOOGLE_APPLICATION_CREDENTIALS file path still works locally", async () => {
    setEnvironment({
      OCR_PROVIDER: "google-vision",
      GOOGLE_CLOUD_CREDENTIALS_JSON: undefined,
      GOOGLE_APPLICATION_CREDENTIALS: fileURLToPath(new URL("../../package.json", import.meta.url)),
      FIREBASE_PROJECT_ID: "test-project",
      FIREBASE_CLIENT_EMAIL: "test@example.com",
      FIREBASE_PRIVATE_KEY: "private-key"
    });

    await expect(loadEnv()).resolves.toMatchObject({ OCR_PROVIDER: "google-vision" });
  });
});
