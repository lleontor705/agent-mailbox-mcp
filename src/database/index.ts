import Database from "better-sqlite3";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const DEFAULT_DIR = path.join(os.homedir(), ".agent-mailbox");
const DB_DIR = process.env.MAILBOX_DIR || DEFAULT_DIR;
const DB_PATH = process.env.MAILBOX_DB || path.join(DB_DIR, "mailbox.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = normal");
  db.pragma("cache_size = -32000");
  db.pragma("temp_store = memory");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");

  const versionInfo = db.prepare("SELECT sqlite_version() as version").get() as { version: string };
  console.error(`Agent Mailbox MCP: SQLite ${versionInfo.version}, WAL mode enabled`);
  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_registry (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT '',
      last_active TEXT NOT NULL DEFAULT (datetime('now')),
      registered_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      participants TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'pending',
      thread_id TEXT REFERENCES threads(id),
      dedup_key TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      delivered_at TEXT,
      acked_at TEXT,
      expires_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient, status);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender);
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
    CREATE INDEX IF NOT EXISTS idx_messages_priority ON messages(priority);
  `);
}

export function closeDb(): void {
  if (db) { db.close(); db = null; }
}
