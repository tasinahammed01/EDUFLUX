import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hash, verify, Algorithm } from "@node-rs/argon2";
import { env } from "../../config/env.js";

const productionHashOptions = { algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;
const testHashOptions = { algorithm: Algorithm.Argon2id, memoryCost: 4_096, timeCost: 1, parallelism: 1, outputLen: 32 } as const;

export function hashPassword(password: string): Promise<string> { return hash(password, env.NODE_ENV === "test" ? testHashOptions : productionHashOptions); }
export function verifyPassword(passwordHash: string, password: string): Promise<boolean> { return verify(passwordHash, password); }
export function generateSessionToken(): string { return randomBytes(32).toString("base64url"); }
export function hashSessionToken(token: string): string { return createHash("sha256").update(token).digest("base64url"); }
export function hashIp(ip: string): string { return createHmac("sha256", env.SESSION_SECRET).update(ip).digest("hex"); }

export function createCsrfToken(): string {
  const nonce = randomBytes(24).toString("base64url");
  const signature = createHmac("sha256", env.CSRF_SECRET).update(nonce).digest("base64url");
  return `${nonce}.${signature}`;
}

export function verifyCsrfToken(token: string): boolean {
  const [nonce, signature] = token.split(".");
  if (!nonce || !signature) return false;
  const expected = createHmac("sha256", env.CSRF_SECRET).update(nonce).digest();
  let received: Buffer;
  try { received = Buffer.from(signature, "base64url"); } catch { return false; }
  return received.length === expected.length && timingSafeEqual(received, expected);
}
