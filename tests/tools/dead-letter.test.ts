import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { DeadLetterRepository } from "../../src/database/repositories/dead-letter.js";
import { initFromDb } from "../../src/database/index.js";

let db: Database.Database;
let dlq: DeadLetterRepository;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const repos = initFromDb(db);
  dlq = repos.deadLetter;
});

afterEach(() => {
  db.close();
});

describe("DeadLetterRepository", () => {
  const fakeMessage = {
    id: "msg-123",
    sender: "alice",
    recipient: "bob",
    subject: "Test",
    body: "Hello world",
  };

  it("moves a message to dead letter queue", () => {
    const id = dlq.moveToDeadLetter(fakeMessage, "expired");
    expect(id).toMatch(/^dlq-/);

    const entry = dlq.findById(id);
    expect(entry).toBeDefined();
    expect(entry!.original_message_id).toBe("msg-123");
    expect(entry!.reason).toBe("expired");
    expect(entry!.retry_count).toBe(0);
  });

  it("lists dead letter entries", () => {
    dlq.moveToDeadLetter(fakeMessage, "expired");
    dlq.moveToDeadLetter({ ...fakeMessage, id: "msg-456" }, "delivery_failed");

    const entries = dlq.list();
    expect(entries).toHaveLength(2);
  });

  it("counts entries", () => {
    expect(dlq.count()).toBe(0);
    dlq.moveToDeadLetter(fakeMessage, "expired");
    expect(dlq.count()).toBe(1);
  });

  it("increments retry count", () => {
    const id = dlq.moveToDeadLetter(fakeMessage, "expired");
    dlq.incrementRetry(id);
    dlq.incrementRetry(id);

    const entry = dlq.findById(id);
    expect(entry!.retry_count).toBe(2);
    expect(entry!.last_retry_at).toBeTruthy();
  });

  it("deletes an entry", () => {
    const id = dlq.moveToDeadLetter(fakeMessage, "expired");
    expect(dlq.delete(id)).toBe(true);
    expect(dlq.findById(id)).toBeUndefined();
  });

  it("purges all entries", () => {
    dlq.moveToDeadLetter(fakeMessage, "expired");
    dlq.moveToDeadLetter({ ...fakeMessage, id: "msg-456" }, "expired");

    const removed = dlq.purge();
    expect(removed).toBe(2);
    expect(dlq.count()).toBe(0);
  });

  it("supports pagination", () => {
    for (let i = 0; i < 5; i++) {
      dlq.moveToDeadLetter({ ...fakeMessage, id: `msg-${i}` }, "expired");
    }

    const page1 = dlq.list(2, 0);
    const page2 = dlq.list(2, 2);
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page1[0].id).not.toBe(page2[0].id);
  });
});
