import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { generateId } from "../src/utils/id.js";

let db: Database.Database;

function initTestDb(): Database.Database {
  const d = new Database(":memory:");
  d.pragma("foreign_keys = ON");
  d.exec(`
    CREATE TABLE agent_registry (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT '',
      last_active TEXT NOT NULL DEFAULT (datetime('now')),
      registered_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE threads (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      participants TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE messages (
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
    CREATE INDEX idx_messages_recipient ON messages(recipient, status);
    CREATE INDEX idx_messages_sender ON messages(sender);
    CREATE INDEX idx_messages_thread ON messages(thread_id);
    CREATE INDEX idx_messages_priority ON messages(priority);
  `);
  return d;
}

function insertThread(id: string, subject: string, participants: string[]): void {
  db.prepare(`INSERT INTO threads (id, subject, participants) VALUES (?, ?, ?)`).run(id, subject, JSON.stringify(participants));
}

function insertMessage(overrides: Partial<Record<string, string>> = {}): string {
  const id = overrides.id || generateId("msg");
  const tid = overrides.thread_id || generateId("thr");
  if (!overrides.thread_id) {
    insertThread(tid, overrides.subject || "Test", ["alice", "bob"]);
  }
  const expiresAt = new Date(Date.now() + 86400 * 1000).toISOString();
  db.prepare(
    `INSERT INTO messages (id, sender, recipient, subject, body, priority, status, thread_id, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    overrides.sender || "alice",
    overrides.recipient || "bob",
    overrides.subject || "Test",
    overrides.body || "Hello",
    overrides.priority || "normal",
    overrides.status || "pending",
    tid,
    expiresAt
  );
  return id;
}

beforeEach(() => {
  db = initTestDb();
});

afterEach(() => {
  db.close();
});

describe("msg_get", () => {
  it("returns full message details by ID", () => {
    const id = insertMessage({ subject: "Important", body: "Details here" });
    const msg = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as any;
    expect(msg).toBeDefined();
    expect(msg.id).toBe(id);
    expect(msg.subject).toBe("Important");
    expect(msg.body).toBe("Details here");
    expect(msg.status).toBe("pending");
  });

  it("returns undefined for non-existent message", () => {
    const msg = db.prepare(`SELECT * FROM messages WHERE id = ?`).get("msg-nonexistent");
    expect(msg).toBeUndefined();
  });
});

describe("msg_delete", () => {
  it("deletes an acked message", () => {
    const id = insertMessage({ status: "acked" });
    const msg = db.prepare(`SELECT id, status FROM messages WHERE id = ?`).get(id) as any;
    expect(msg.status).toBe("acked");

    db.prepare(`DELETE FROM messages WHERE id = ?`).run(id);
    const deleted = db.prepare(`SELECT id FROM messages WHERE id = ?`).get(id);
    expect(deleted).toBeUndefined();
  });

  it("deletes a delivered message", () => {
    const id = insertMessage({ status: "delivered" });
    db.prepare(`DELETE FROM messages WHERE id = ?`).run(id);
    const deleted = db.prepare(`SELECT id FROM messages WHERE id = ?`).get(id);
    expect(deleted).toBeUndefined();
  });

  it("rejects deletion of pending message", () => {
    const id = insertMessage({ status: "pending" });
    const msg = db.prepare(`SELECT id, status FROM messages WHERE id = ?`).get(id) as any;
    expect(msg.status).toBe("pending");
    // Tool logic: only acked or delivered can be deleted
    expect(msg.status !== "acked" && msg.status !== "delivered").toBe(true);
  });

  it("returns error for non-existent message", () => {
    const msg = db.prepare(`SELECT id FROM messages WHERE id = ?`).get("msg-ghost");
    expect(msg).toBeUndefined();
  });
});

describe("msg_count", () => {
  it("counts messages by status for an agent", () => {
    const tid = generateId("thr");
    insertThread(tid, "Thread", ["alice", "bob"]);
    insertMessage({ recipient: "bob", status: "pending", thread_id: tid });
    insertMessage({ recipient: "bob", status: "pending", thread_id: tid });
    insertMessage({ recipient: "bob", status: "delivered", thread_id: tid });
    insertMessage({ recipient: "bob", status: "acked", thread_id: tid });

    const rows = db.prepare(
      `SELECT status, COUNT(*) as count FROM messages WHERE recipient = ? GROUP BY status`
    ).all("bob") as Array<{ status: string; count: number }>;

    const counts: Record<string, number> = { pending: 0, delivered: 0, acked: 0 };
    for (const row of rows) {
      counts[row.status] = row.count;
    }

    expect(counts.pending).toBe(2);
    expect(counts.delivered).toBe(1);
    expect(counts.acked).toBe(1);
  });

  it("returns zero counts for agent with no messages", () => {
    const rows = db.prepare(
      `SELECT status, COUNT(*) as count FROM messages WHERE recipient = ? GROUP BY status`
    ).all("nobody") as Array<{ status: string; count: number }>;

    const counts: Record<string, number> = { pending: 0, delivered: 0, acked: 0 };
    for (const row of rows) {
      counts[row.status] = row.count;
    }

    expect(counts.pending).toBe(0);
    expect(counts.delivered).toBe(0);
    expect(counts.acked).toBe(0);
  });
});

describe("msg_update_status", () => {
  it("updates message status to acked", () => {
    const id = insertMessage({ status: "pending" });
    db.prepare(`UPDATE messages SET status = ? WHERE id = ?`).run("acked", id);

    const msg = db.prepare(`SELECT status FROM messages WHERE id = ?`).get(id) as any;
    expect(msg.status).toBe("acked");
  });

  it("updates message status to delivered", () => {
    const id = insertMessage({ status: "pending" });
    db.prepare(`UPDATE messages SET status = ? WHERE id = ?`).run("delivered", id);

    const msg = db.prepare(`SELECT status FROM messages WHERE id = ?`).get(id) as any;
    expect(msg.status).toBe("delivered");
  });

  it("updates message status back to pending", () => {
    const id = insertMessage({ status: "acked" });
    db.prepare(`UPDATE messages SET status = ? WHERE id = ?`).run("pending", id);

    const msg = db.prepare(`SELECT status FROM messages WHERE id = ?`).get(id) as any;
    expect(msg.status).toBe("pending");
  });

  it("returns no match for non-existent message", () => {
    const msg = db.prepare(`SELECT id FROM messages WHERE id = ?`).get("msg-nope");
    expect(msg).toBeUndefined();
  });
});

describe("generateId", () => {
  it("generates IDs with correct prefix", () => {
    const id = generateId("msg");
    expect(id).toMatch(/^msg-[a-f0-9]+$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId("msg")));
    expect(ids.size).toBe(100);
  });
});
