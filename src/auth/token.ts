import { createHmac, timingSafeEqual } from "node:crypto";
import type { Scope } from "./scopes.js";

export interface TokenPayload {
  /** Agent identifier (subject) */
  sub: string;
  /** Granted scopes */
  scopes: Scope[];
  /** Issued at (unix seconds) */
  iat: number;
  /** Expires at (unix seconds) */
  exp: number;
}

export interface AuthInfo {
  agentId: string;
  scopes: Scope[];
}

const ALGORITHM = "sha256";

function base64UrlEncode(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function sign(payload: string, secret: string): string {
  return createHmac(ALGORITHM, secret).update(payload).digest("base64url");
}

/**
 * Generate a JWT token for an agent.
 * Uses HMAC-SHA256 — no external dependencies.
 */
export function generateToken(
  agentId: string,
  scopes: Scope[],
  secret: string,
  ttlSeconds: number = 86400
): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub: agentId,
    scopes,
    iat: now,
    exp: now + ttlSeconds,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const content = `${header}.${encodedPayload}`;
  const signature = sign(content, secret);
  return `${content}.${signature}`;
}

/**
 * Verify a JWT token and return auth info.
 * Throws on invalid/expired tokens.
 */
export function verifyToken(token: string, secret: string): AuthInfo {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const [header, encodedPayload, signature] = parts;
  const content = `${header}.${encodedPayload}`;
  const expectedSig = sign(content, secret);

  // Timing-safe comparison
  const sigBuf = Buffer.from(signature, "base64url");
  const expectedBuf = Buffer.from(expectedSig, "base64url");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error("Invalid token signature");
  }

  const payload: TokenPayload = JSON.parse(base64UrlDecode(encodedPayload));

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    throw new Error("Token expired");
  }

  return {
    agentId: payload.sub,
    scopes: payload.scopes,
  };
}
