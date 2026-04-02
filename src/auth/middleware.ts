import type { Request, Response, NextFunction } from "express";
import type { AuthInfo as SdkAuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { verifyToken } from "./token.js";
import { loadConfig } from "../config.js";
import type { Scope } from "./scopes.js";

/**
 * Express middleware that validates Bearer tokens on HTTP transport.
 * If MAILBOX_AUTH_SECRET is not set, auth is disabled (development mode).
 * Sets req.auth compatible with MCP SDK's AuthInfo interface.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const config = loadConfig();

  // No secret configured → auth disabled (dev mode)
  if (!config.authSecret) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const info = verifyToken(token, config.authSecret);
    // Set auth compatible with MCP SDK's expected AuthInfo
    (req as any).auth = {
      token,
      clientId: info.agentId,
      scopes: info.scopes,
    } satisfies SdkAuthInfo;
    next();
  } catch (err) {
    res.status(401).json({ error: (err as Error).message });
  }
}

/**
 * Middleware factory that requires specific scopes.
 */
export function requireScopes(...requiredScopes: Scope[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const auth = (req as any).auth as SdkAuthInfo | undefined;
    // If no auth is configured, allow all
    if (!auth) {
      next();
      return;
    }

    const hasAll = requiredScopes.every((s) => auth.scopes?.includes(s));
    if (!hasAll) {
      res.status(403).json({
        error: "Insufficient permissions",
        required: requiredScopes,
        granted: auth.scopes,
      });
      return;
    }

    next();
  };
}
