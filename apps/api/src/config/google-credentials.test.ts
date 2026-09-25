import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveCredentialPath, resolveGoogleCredentialConfig, validateCredentialFile, parseGoogleCredentialsJson, normalizePrivateKey, loadGoogleCredentials } from "./google-credentials.js";

let temporaryDirectory: string | undefined;
afterEach(() => { if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true }); temporaryDirectory = undefined; });

describe("Google credential path resolution", () => {
  it("preserves an absolute Windows path without adding a backend/key prefix", () => {
    const absolute = "D:\\ALL Projects\\EduFlux\\apps\\api\\key\\vision_key.json";
    expect(resolveCredentialPath(absolute, "D:\\ALL Projects\\EduFlux\\apps\\api")).toBe(path.normalize(absolute));
    expect(resolveCredentialPath(absolute)).not.toContain(`backend${path.sep}key`);
  });
  it("resolves relative paths against the API package root", () => {
    expect(resolveCredentialPath("key/vision_key.json", "D:\\repo\\apps\\api")).toBe(path.resolve("D:\\repo\\apps\\api", "key/vision_key.json"));
  });
  it("prefers GOOGLE_APPLICATION_CREDENTIALS and supports the legacy fallback", () => {
    expect(resolveGoogleCredentialConfig({ applicationCredentials: "key/current.json", legacyKeyFile: "key/legacy.json", packageRoot: "D:\\api" })).toMatchObject({ source: "GOOGLE_APPLICATION_CREDENTIALS", configuredPath: "key/current.json" });
    expect(resolveGoogleCredentialConfig({ legacyKeyFile: "key/legacy.json", packageRoot: "D:\\api" })).toMatchObject({ source: "GOOGLE_CLOUD_KEY_FILE", configuredPath: "key/legacy.json" });
  });
  it("validates readable files and rejects missing paths", () => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "eduflux-vision-"));
    const fixture = path.join(temporaryDirectory, "fixture.json");
    writeFileSync(fixture, "{}");
    expect(() => validateCredentialFile(fixture)).not.toThrow();
    expect(() => validateCredentialFile(path.join(temporaryDirectory, "missing.json"))).toThrow(/credential file not found/i);
  });
  it("error messages do not contain secret material", () => {
    expect(() => validateCredentialFile("nonexistent-path")).toThrow(/credential file not found/i);
    expect(() => validateCredentialFile("nonexistent-path")).not.toThrow(/private_key/i);
    expect(() => validateCredentialFile("nonexistent-path")).not.toThrow(/client_email/i);
  });
});

describe("Google JSON credentials", () => {
  it("prefers JSON credentials over file credentials", () => {
    const jsonCreds = '{"client_email":"test@example.com","private_key":"key","project_id":"test-project"}';
    expect(resolveGoogleCredentialConfig({ credentialsJson: jsonCreds, applicationCredentials: "key/file.json" })).toMatchObject({ source: "GOOGLE_CLOUD_CREDENTIALS_JSON" });
  });
  it("parses valid JSON credentials successfully", () => {
    const jsonCreds = '{"client_email":"test@example.com","private_key":"-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----","project_id":"test-project"}';
    const parsed = parseGoogleCredentialsJson(jsonCreds);
    expect(parsed.client_email).toBe("test@example.com");
    expect(parsed.private_key).toContain("-----BEGIN PRIVATE KEY-----");
    expect(parsed.project_id).toBe("test-project");
  });
  it("converts escaped newlines in private key", () => {
    const escapedKey = "-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----";
    const normalized = normalizePrivateKey(escapedKey);
    expect(normalized).toBe("-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----");
  });
  it("fails safely on malformed JSON", () => {
    expect(() => parseGoogleCredentialsJson("invalid json")).toThrow("GOOGLE_CLOUD_CREDENTIALS_JSON is not valid JSON");
  });
  it("returns empty config when no credentials provided", () => {
    const config = resolveGoogleCredentialConfig({});
    expect(config.source).toBeUndefined();
  });
  it("secrets never appear in credential config structure", () => {
    const jsonCreds = '{"client_email":"test@example.com","private_key":"secret-key","project_id":"test-project"}';
    const config = resolveGoogleCredentialConfig({ credentialsJson: jsonCreds });
    expect(config.credentials?.private_key).toBe("secret-key");
    expect(config.credentials?.client_email).toBe("test@example.com");
  });
});

describe("loadGoogleCredentials", () => {
  it("loads JSON credentials from env", () => {
    const jsonCreds = '{"client_email":"test@example.com","private_key":"-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----","project_id":"test-project"}';
    const config = resolveGoogleCredentialConfig({ credentialsJson: jsonCreds });
    const credentials = loadGoogleCredentials(config);
    expect(credentials).toMatchObject({
      projectId: "test-project",
      clientEmail: "test@example.com",
      source: "json_env",
    });
    expect(credentials.privateKey).toContain("-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----");
  });

  it("loads credentials from file path", () => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "eduflux-vision-"));
    const fixture = path.join(temporaryDirectory, "credentials.json");
    const jsonCreds = '{"client_email":"test@example.com","private_key":"-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----","project_id":"test-project"}';
    writeFileSync(fixture, jsonCreds);
    const config = resolveGoogleCredentialConfig({ applicationCredentials: fixture, packageRoot: temporaryDirectory });
    const credentials = loadGoogleCredentials(config);
    expect(credentials).toMatchObject({
      projectId: "test-project",
      clientEmail: "test@example.com",
      source: "file_path",
    });
  });

  it("fails when JSON credentials missing required fields", () => {
    const jsonCreds = '{"client_email":"test@example.com","project_id":"test-project"}';
    const config = resolveGoogleCredentialConfig({ credentialsJson: jsonCreds });
    expect(() => loadGoogleCredentials(config)).toThrow("GOOGLE_CLOUD_CREDENTIALS_JSON is missing required fields");
  });

  it("fails when file credentials missing required fields", () => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "eduflux-vision-"));
    const fixture = path.join(temporaryDirectory, "credentials.json");
    const jsonCreds = '{"client_email":"test@example.com","project_id":"test-project"}';
    writeFileSync(fixture, jsonCreds);
    const config = resolveGoogleCredentialConfig({ applicationCredentials: fixture, packageRoot: temporaryDirectory });
    expect(() => loadGoogleCredentials(config)).toThrow("Google credentials file is missing required fields");
  });

  it("fails when no valid credential configuration", () => {
    const config = resolveGoogleCredentialConfig({});
    expect(() => loadGoogleCredentials(config)).toThrow("No valid Google credentials configuration found");
  });

  it("error messages do not contain secret material", () => {
    const jsonCreds = '{"client_email":"test@example.com","private_key":"secret-key","project_id":"test-project"}';
    const config = resolveGoogleCredentialConfig({ credentialsJson: jsonCreds });
    try {
      loadGoogleCredentials(config);
    } catch (error) {
      expect(error instanceof Error && error.message).not.toContain("secret-key");
    }
  });

  it("JSON credentials do NOT call file-path validation", () => {
    const jsonCreds = '{"client_email":"test@example.com","private_key":"-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----","project_id":"test-project"}';
    const config = resolveGoogleCredentialConfig({ credentialsJson: jsonCreds });
    const credentials = loadGoogleCredentials(config);
    expect(credentials.source).toBe("json_env");
  });
});
