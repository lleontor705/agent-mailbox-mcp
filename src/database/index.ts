import Database from "better-sqlite3";
import fs from "node:fs";
import { loadConfig } from "../config.js";
import { runMigrations } from "./migrations.js";
import { createRepositories, type Repositories } from "./repositories/index.js";

let db: Database.Database | null = null;
let repos: Repositories | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const config = loadConfig();
  fs.mkdirSync(config.dbDir, { recursive: true });
  db = new Database(config.dbPath);
  configurePragmas(db);

  const versionInfo = db.prepare("SELECT sqlite_version() as version").get() as { version: string };
  console.error(`Agent Mailbox MCP: SQLite ${versionInfo.version}, WAL mode enabled`);

  initSchema(db);
  runMigrations(db);
  repos = createRepositories(db);
  return db;
}

/** Initialize from an existing Database instance (for testing) */
export function initFromDb(database: Database.Database): Repositories {
  initSchema(database);
  runMigrations(database);
  return createRepositories(database);
}

export function getRepos(): Repositories {
  if (!repos) {
    getDb(); // triggers initialization
  }
  return repos!;
}

function configurePragmas(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = normal");
  db.pragma("cache_size = -32000");
  db.pragma("temp_store = memory");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
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
  if (db) { db.close(); db = null; repos = null; }
}
