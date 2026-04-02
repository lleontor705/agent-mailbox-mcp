import path from "node:path";
import os from "node:os";

export type TransportMode = "stdio" | "http" | "both";

export interface Config {
  /** Database directory */
  dbDir: string;
  /** Full database file path */
  dbPath: string;
  /** Message TTL in seconds */
  ttlSeconds: number;
  /** HTTP server port */
  port: number;
  /** Transport mode */
  transport: TransportMode;
  /** Auth secret for JWT signing (HTTP only) */
  authSecret: string;
}

const DEFAULT_DIR = path.join(os.homedir(), ".agent-mailbox");

export function loadConfig(): Config {
  const dbDir = process.env.MAILBOX_DIR || DEFAULT_DIR;
  return {
    dbDir,
    dbPath: process.env.MAILBOX_DB || path.join(dbDir, "mailbox.db"),
    ttlSeconds: parseInt(process.env.MAILBOX_TTL || "86400", 10),
    port: parseInt(process.env.MAILBOX_PORT || "4820", 10),
    transport: parseTransport(process.env.MAILBOX_TRANSPORT),
    authSecret: process.env.MAILBOX_AUTH_SECRET || "",
  };
}

function parseTransport(value: string | undefined): TransportMode {
  if (value === "http" || value === "both") return value;
  return "stdio";
}
