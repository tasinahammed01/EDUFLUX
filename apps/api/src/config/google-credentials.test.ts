import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveCredentialPath, resolveGoogleCredentialConfig, validateCredentialFile } from "./google-credentials.js";

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
});
