import { accessSync, constants, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

export const API_PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export type GoogleCredentialConfig = {
  source?: "GOOGLE_CLOUD_CREDENTIALS_JSON" | "GOOGLE_APPLICATION_CREDENTIALS" | "GOOGLE_CLOUD_KEY_FILE";
  configuredPath?: string;
  resolvedPath?: string;
  credentials?: {
    client_email?: string;
    private_key?: string;
    project_id?: string;
  };
};

export type NormalizedGoogleCredentials = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  source: "json_env" | "file_path";
};

export function resolveCredentialPath(value: string, packageRoot = API_PACKAGE_ROOT) {
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(packageRoot, value);
}

export function parseGoogleCredentialsJson(jsonString: string): { client_email?: string; private_key?: string; project_id?: string } {
  try {
    const parsed = JSON.parse(jsonString);
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
      project_id: parsed.project_id,
    };
  } catch {
    throw new Error("GOOGLE_CLOUD_CREDENTIALS_JSON is not valid JSON");
  }
}

export function resolveGoogleCredentialConfig(input: {
  credentialsJson?: string;
  applicationCredentials?: string;
  legacyKeyFile?: string;
  packageRoot?: string;
}): GoogleCredentialConfig {
  const credentialsJson = input.credentialsJson?.trim();
  if (credentialsJson) {
    const credentials = parseGoogleCredentialsJson(credentialsJson);
    return {
      source: "GOOGLE_CLOUD_CREDENTIALS_JSON",
      credentials,
    };
  }
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
  const credentialsJson = local.GOOGLE_CLOUD_CREDENTIALS_JSON || process.env.GOOGLE_CLOUD_CREDENTIALS_JSON;
  const applicationCredentials = local.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const legacyKeyFile = local.GOOGLE_CLOUD_KEY_FILE || process.env.GOOGLE_CLOUD_KEY_FILE;
  return resolveGoogleCredentialConfig({
    ...(credentialsJson ? { credentialsJson } : {}),
    ...(applicationCredentials ? { applicationCredentials } : {}),
    ...(legacyKeyFile ? { legacyKeyFile } : {}),
  });
}

export function validateCredentialFile(resolvedPath: string) {
  if (!existsSync(resolvedPath)) throw new Error("Google Vision credential file not found");
  if (!statSync(resolvedPath).isFile()) throw new Error("Google Vision credential path is not a file");
  try { accessSync(resolvedPath, constants.R_OK); }
  catch { throw new Error("Google Vision credential file is not readable"); }
}

export function normalizePrivateKey(privateKey: string): string {
  // Handle escaped newlines in environment variable storage
  return privateKey.replace(/\\n/g, "\n");
}

export function loadGoogleCredentials(config: GoogleCredentialConfig): NormalizedGoogleCredentials {
  if (config.source === "GOOGLE_CLOUD_CREDENTIALS_JSON" && config.credentials) {
    const { client_email, private_key, project_id } = config.credentials;
    if (!client_email || !private_key || !project_id) {
      throw new Error("GOOGLE_CLOUD_CREDENTIALS_JSON is missing required fields: client_email, private_key, or project_id");
    }
    return {
      projectId: project_id,
      clientEmail: client_email,
      privateKey: normalizePrivateKey(private_key),
      source: "json_env",
    };
  }

  if (config.resolvedPath) {
    const fileContent = readFileSync(config.resolvedPath, "utf-8");
    const parsed = parseGoogleCredentialsJson(fileContent);
    const { client_email, private_key, project_id } = parsed;
    if (!client_email || !private_key || !project_id) {
      throw new Error("Google credentials file is missing required fields: client_email, private_key, or project_id");
    }
    return {
      projectId: project_id,
      clientEmail: client_email,
      privateKey: normalizePrivateKey(private_key),
      source: "file_path",
    };
  }

  throw new Error("No valid Google credentials configuration found");
}
