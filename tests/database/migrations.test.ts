import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations, getCurrentVersion } from "../../src/database/migrations.js";

let db: Database.Database;

function initBaseSchema(d: Database.Database): void {
  d.exec(`
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
  `);
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initBaseSchema(db);
});

afterEach(() => {
  db.close();
});

describe("migrations", () => {
  it("creates schema_version table", () => {
    runMigrations(db);
    const table = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'`)
      .get();
    expect(table).toBeDefined();
  });

  it("runs migration 1: thread_participants table", () => {
    runMigrations(db);
    const table = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='thread_participants'`)
      .get();
    expect(table).toBeDefined();
  });

  it("backfills thread_participants from JSON", () => {
    // Insert threads with JSON participants BEFORE running migration
    db.prepare(`INSERT INTO threads (id, subject, participants) VALUES (?, ?, ?)`)
      .run("thr-1", "Test", JSON.stringify(["alice", "bob"]));
    db.prepare(`INSERT INTO threads (id, subject, participants) VALUES (?, ?, ?)`)
      .run("thr-2", "Other", JSON.stringify(["charlie"]));

    runMigrations(db);

    const participants = db
      .prepare(`SELECT * FROM thread_participants ORDER BY thread_id, agent_id`)
      .all() as Array<{ thread_id: string; agent_id: string }>;

    expect(participants).toHaveLength(3);
    expect(participants[0]).toEqual({ thread_id: "thr-1", agent_id: "alice" });
    expect(participants[1]).toEqual({ thread_id: "thr-1", agent_id: "bob" });
    expect(participants[2]).toEqual({ thread_id: "thr-2", agent_id: "charlie" });
  });

  it("is idempotent — running twice does not fail", () => {
    runMigrations(db);
    expect(() => runMigrations(db)).not.toThrow();
  });

  it("tracks version correctly", () => {
    expect(getCurrentVersion(db)).toBe(0);
    runMigrations(db);
    expect(getCurrentVersion(db)).toBeGreaterThanOrEqual(1);
  });

  it("handles malformed JSON participants gracefully", () => {
    db.prepare(`INSERT INTO threads (id, subject, participants) VALUES (?, ?, ?)`)
      .run("thr-bad", "Bad", "not-json");

    expect(() => runMigrations(db)).not.toThrow();
  });
});
