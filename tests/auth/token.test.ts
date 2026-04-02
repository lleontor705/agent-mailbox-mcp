import { describe, it, expect } from "vitest";
import { generateToken, verifyToken } from "../../src/auth/token.js";
import type { Scope } from "../../src/auth/scopes.js";

const SECRET = "test-secret-key-for-testing";
const SCOPES: Scope[] = ["messages:read", "messages:write"];

describe("JWT token", () => {
  it("generates a valid JWT with 3 parts", () => {
    const token = generateToken("alice", SCOPES, SECRET);
    expect(token.split(".")).toHaveLength(3);
  });

  it("verifies a valid token", () => {
    const token = generateToken("alice", SCOPES, SECRET);
    const info = verifyToken(token, SECRET);
    expect(info.agentId).toBe("alice");
    expect(info.scopes).toEqual(SCOPES);
  });

  it("rejects token with wrong secret", () => {
    const token = generateToken("alice", SCOPES, SECRET);
    expect(() => verifyToken(token, "wrong-secret")).toThrow("Invalid token signature");
  });

  it("rejects expired token", () => {
    const token = generateToken("alice", SCOPES, SECRET, -1); // already expired
    expect(() => verifyToken(token, SECRET)).toThrow("Token expired");
  });

  it("rejects malformed token", () => {
    expect(() => verifyToken("not.a.valid.token.here", SECRET)).toThrow("Invalid token format");
    expect(() => verifyToken("onlyonepart", SECRET)).toThrow("Invalid token format");
  });

  it("rejects tampered payload", () => {
    const token = generateToken("alice", SCOPES, SECRET);
    const parts = token.split(".");
    // Tamper with payload
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: "mallory", scopes: ["messages:admin"], iat: 0, exp: 9999999999 })
    ).toString("base64url");
    const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    expect(() => verifyToken(tampered, SECRET)).toThrow("Invalid token signature");
  });

  it("preserves scopes through round-trip", () => {
    const allScopes: Scope[] = ["messages:read", "messages:write", "messages:admin", "agents:read", "agents:write", "a2a:submit"];
    const token = generateToken("admin", allScopes, SECRET);
    const info = verifyToken(token, SECRET);
    expect(info.scopes).toEqual(allScopes);
  });
});
