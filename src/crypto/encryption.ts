import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { loadConfig } from "../config.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getSalt(): string {
  const envSalt = process.env.MAILBOX_SALT;
  if (envSalt) return envSalt;

  const saltFile = join(process.env.MAILBOX_DB_PATH || join(process.env.HOME || process.env.USERPROFILE || ".", ".agent-mailbox"), "encryption.salt");
  if (existsSync(saltFile)) return readFileSync(saltFile, "utf-8").trim();

  const salt = randomBytes(16).toString("hex");
  const dir = dirname(saltFile);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(saltFile, salt, { mode: 0o600 });
  return salt;
}

const SALT = getSalt();

let derivedKey: Buffer | null = null;

function getKey(): Buffer | null {
  if (derivedKey) return derivedKey;
  const secret = process.env.MAILBOX_ENCRYPTION_KEY;
  if (!secret) return null;
  derivedKey = pbkdf2Sync(secret, SALT, 100000, KEY_LENGTH, "sha256");
  return derivedKey;
}

/**
 * Check if encryption is enabled.
 */
export function isEncryptionEnabled(): boolean {
  return !!process.env.MAILBOX_ENCRYPTION_KEY;
}

/**
 * Encrypt plaintext. Returns base64-encoded string: iv:ciphertext:tag
 * If no encryption key is configured, returns plaintext unchanged (pass-through).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const tag = cipher.getAuthTag();

  return `enc:${iv.toString("base64")}:${encrypted}:${tag.toString("base64")}`;
}

/**
 * Decrypt ciphertext. Expects format: enc:iv:ciphertext:tag (base64)
 * If input doesn't start with "enc:", assumes plaintext (pass-through).
 */
export function decrypt(data: string): string {
  if (!data.startsWith("enc:")) return data;

  const key = getKey();
  if (!key) return data; // Can't decrypt without key

  const parts = data.split(":");
  if (parts.length !== 4) return data;

  const [, ivB64, ciphertext, tagB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
