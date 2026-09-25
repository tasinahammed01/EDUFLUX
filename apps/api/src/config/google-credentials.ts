import { accessSync, constants, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

export const API_PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export type GoogleCredentialConfig = {
  source?: "GOOGLE_APPLICATION_CREDENTIALS" | "GOOGLE_CLOUD_KEY_FILE";
  configuredPath?: string;
  resolvedPath?: string;
};

export function resolveCredentialPath(value: string, packageRoot = API_PACKAGE_ROOT) {
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(packageRoot, value);
}

export function resolveGoogleCredentialConfig(input: {
  applicationCredentials?: string;
  legacyKeyFile?: string;
  packageRoot?: string;
}): GoogleCredentialConfig {
  const configuredPath = input.applicationCredentials?.trim() || input.legacyKeyFile?.trim();
  if (!configuredPath) return {};
  return {
    source: input.applicationCredentials?.trim() ? "GOOGLE_APPLICATION_CREDENTIALS" : "GOOGLE_CLOUD_KEY_FILE",
    configuredPath,
    resolvedPath: resolveCredentialPath(configuredPath, input.packageRoot),
  };
}

export function readLocalGoogleCredentialConfig(nodeEnv = process.env.NODE_ENV) {
  let local: Record<string, string> = {};
  const envPath = path.join(API_PACKAGE_ROOT, ".env");
  if (nodeEnv !== "production" && !process.env.VITEST && existsSync(envPath)) local = parse(readFileSync(envPath));
  const applicationCredentials = local.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const legacyKeyFile = local.GOOGLE_CLOUD_KEY_FILE || process.env.GOOGLE_CLOUD_KEY_FILE;
  return resolveGoogleCredentialConfig({
    ...(applicationCredentials ? { applicationCredentials } : {}),
    ...(legacyKeyFile ? { legacyKeyFile } : {}),
  });
}

export function validateCredentialFile(resolvedPath: string) {
  if (!existsSync(resolvedPath)) throw new Error(`Google Vision credential file not found: ${resolvedPath}`);
  if (!statSync(resolvedPath).isFile()) throw new Error(`Google Vision credential path is not a file: ${resolvedPath}`);
  try { accessSync(resolvedPath, constants.R_OK); }
  catch { throw new Error(`Google Vision credential file is not readable: ${resolvedPath}`); }
}
