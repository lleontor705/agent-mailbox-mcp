import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { MessageRepository } from "../../src/database/repositories/messages.js";
import { ThreadRepository } from "../../src/database/repositories/threads.js";
import { AgentRepository } from "../../src/database/repositories/agents.js";
import { initFromDb } from "../../src/database/index.js";

let db: Database.Database;
let messages: MessageRepository;
let threads: ThreadRepository;
let agents: AgentRepository;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const repos = initFromDb(db);
  messages = repos.messages;
  threads = repos.threads;
  agents = repos.agents;
});

afterEach(() => {
  db.close();
});

describe("MessageRepository", () => {
  function createThread(): string {
    return threads.create("Test subject", ["alice", "bob"]);
  }

  it("inserts and finds a message by id", () => {
    const tid = createThread();
    const id = messages.insert({
      sender: "alice",
      recipient: "bob",
      subject: "Hello",
      body: "World",
      priority: "normal",
      thread_id: tid,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(id).toMatch(/^msg-/);
    const msg = messages.findById(id);
    expect(msg).toBeDefined();
    expect(msg!.sender).toBe("alice");
    expect(msg!.recipient).toBe("bob");
  });

  it("returns undefined for non-existent message", () => {
    expect(messages.findById("msg-nonexistent")).toBeUndefined();
  });

  it("detects duplicate dedup keys", () => {
    const tid = createThread();
    messages.insert({
      sender: "alice", recipient: "bob", subject: "Hi", body: "test",
      priority: "normal", thread_id: tid, dedup_key: "dedup-1",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(messages.hasDedupKey("dedup-1")).toBe(true);
    expect(messages.hasDedupKey("dedup-2")).toBe(false);
  });

  it("finds messages by recipient with priority ordering", () => {
    const tid = createThread();
    const expires = new Date(Date.now() + 86400000).toISOString();
    messages.insert({ sender: "alice", recipient: "bob", subject: "Low", body: "low", priority: "low", thread_id: tid, expires_at: expires });
    messages.insert({ sender: "alice", recipient: "bob", subject: "High", body: "high", priority: "high", thread_id: tid, expires_at: expires });
    messages.insert({ sender: "alice", recipient: "bob", subject: "Normal", body: "normal", priority: "normal", thread_id: tid, expires_at: expires });

    const msgs = messages.findByRecipient("bob", 10);
    expect(msgs).toHaveLength(3);
    expect(msgs[0].priority).toBe("high");
    expect(msgs[1].priority).toBe("normal");
    expect(msgs[2].priority).toBe("low");
  });

  it("marks messages as delivered", () => {
    const tid = createThread();
    const expires = new Date(Date.now() + 86400000).toISOString();
    const id = messages.insert({ sender: "alice", recipient: "bob", subject: "Hi", body: "test", priority: "normal", thread_id: tid, expires_at: expires });

    messages.markDelivered([id]);
    const msg = messages.findById(id);
    expect(msg!.status).toBe("delivered");
    expect(msg!.delivered_at).toBeTruthy();
  });

  it("acknowledges a message", () => {
    const tid = createThread();
    const id = messages.insert({ sender: "alice", recipient: "bob", subject: "Hi", body: "test", priority: "normal", thread_id: tid, expires_at: new Date(Date.now() + 86400000).toISOString() });

    messages.acknowledge(id);
    const msg = messages.findById(id);
    expect(msg!.status).toBe("acked");
    expect(msg!.acked_at).toBeTruthy();
  });

  it("deletes a message", () => {
    const tid = createThread();
    const id = messages.insert({ sender: "alice", recipient: "bob", subject: "Hi", body: "test", priority: "normal", thread_id: tid, expires_at: new Date(Date.now() + 86400000).toISOString() });

    expect(messages.delete(id)).toBe(true);
    expect(messages.findById(id)).toBeUndefined();
    expect(messages.delete("nonexistent")).toBe(false);
  });

  it("searches messages by content", () => {
    const tid = createThread();
    const expires = new Date(Date.now() + 86400000).toISOString();
    messages.insert({ sender: "alice", recipient: "bob", subject: "Project update", body: "The deployment is ready", priority: "normal", thread_id: tid, expires_at: expires });
    messages.insert({ sender: "alice", recipient: "bob", subject: "Lunch", body: "Let's eat", priority: "normal", thread_id: tid, expires_at: expires });

    const results = messages.search("deployment");
    expect(results).toHaveLength(1);
    expect(results[0].subject).toBe("Project update");
  });

  it("searches with agent filter", () => {
    const tid = createThread();
    const expires = new Date(Date.now() + 86400000).toISOString();
    messages.insert({ sender: "alice", recipient: "bob", subject: "Hi", body: "test", priority: "normal", thread_id: tid, expires_at: expires });
    messages.insert({ sender: "charlie", recipient: "dave", subject: "Hi", body: "test", priority: "normal", thread_id: tid, expires_at: expires });

    const results = messages.search("Hi", "alice");
    expect(results).toHaveLength(1);
    expect(results[0].sender).toBe("alice");
  });

  it("counts messages by status", () => {
    const tid = createThread();
    const expires = new Date(Date.now() + 86400000).toISOString();
    messages.insert({ sender: "alice", recipient: "bob", subject: "1", body: "test", priority: "normal", thread_id: tid, expires_at: expires });
    messages.insert({ sender: "alice", recipient: "bob", subject: "2", body: "test", priority: "normal", thread_id: tid, expires_at: expires });

    const id3 = messages.insert({ sender: "alice", recipient: "bob", subject: "3", body: "test", priority: "normal", thread_id: tid, expires_at: expires });
    messages.acknowledge(id3);

    const counts = messages.countByStatus("bob");
    expect(counts.pending).toBe(2);
    expect(counts.acked).toBe(1);
  });

  it("finds reply in thread", () => {
    const tid = createThread();
    const expires = new Date(Date.now() + 86400000).toISOString();
    const reqId = messages.insert({ sender: "alice", recipient: "bob", subject: "Request", body: "help", priority: "normal", thread_id: tid, expires_at: expires });
    const replyId = messages.insert({ sender: "bob", recipient: "alice", subject: "Re: Request", body: "sure", priority: "normal", thread_id: tid, expires_at: expires });

    const reply = messages.findReplyInThread(tid, "bob", "alice", reqId);
    expect(reply).toBeDefined();
    expect(reply!.id).toBe(replyId);
  });
});

describe("ThreadRepository", () => {
  it("creates a thread with participants", () => {
    const tid = threads.create("Topic", ["alice", "bob"]);
    expect(tid).toMatch(/^thr-/);

    const thread = threads.findById(tid);
    expect(thread).toBeDefined();
    expect(thread!.subject).toBe("Topic");
    expect(JSON.parse(thread!.participants)).toEqual(["alice", "bob"]);
  });

  it("adds participants to existing thread", () => {
    const tid = threads.create("Topic", ["alice", "bob"]);
    const merged = threads.addParticipants(tid, ["charlie", "alice"]);
    expect(merged).toEqual(["alice", "bob", "charlie"]);
  });

  it("finds threads by participant using junction table", () => {
    const tid = threads.create("Topic", ["alice", "bob"]);
    // Insert a message to make findByParticipant return meaningful data
    const expires = new Date(Date.now() + 86400000).toISOString();
    db.prepare(
      `INSERT INTO messages (id, sender, recipient, subject, body, priority, thread_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("msg-test1", "alice", "bob", "Hi", "body", "normal", tid, expires);

    const result = threads.findByParticipant("alice");
    expect(result).toHaveLength(1);
    expect((result[0] as any).message_count).toBe(1);
  });

  it("does not find threads for non-participant", () => {
    threads.create("Topic", ["alice", "bob"]);
    const result = threads.findByParticipant("charlie");
    expect(result).toHaveLength(0);
  });
});

describe("AgentRepository", () => {
  it("registers a new agent", () => {
    agents.register("alice", "developer");
    const agent = agents.findById("alice");
    expect(agent).toBeDefined();
    expect(agent!.role).toBe("developer");
  });

  it("updates role on re-registration", () => {
    agents.register("alice", "developer");
    agents.register("alice", "manager");
    const agent = agents.findById("alice");
    expect(agent!.role).toBe("manager");
  });

  it("lists all agents sorted by activity", () => {
    agents.register("alice", "dev");
    agents.register("bob", "pm");
    const list = agents.listAll();
    expect(list).toHaveLength(2);
  });

  it("lists all agents except specified one", () => {
    agents.register("alice", "dev");
    agents.register("bob", "pm");
    agents.register("charlie", "qa");
    const list = agents.listAllExcept("alice");
    expect(list).toHaveLength(2);
    expect(list.map((a) => a.id)).not.toContain("alice");
  });

  it("updates agent activity", () => {
    agents.register("alice", "dev");
    const before = agents.findById("alice");
    agents.updateActivity("alice");
    const after = agents.findById("alice");
    expect(after).toBeDefined();
    // Activity updated (at minimum exists)
    expect(after!.last_active).toBeTruthy();
  });

  it("auto-registers on updateActivity", () => {
    agents.updateActivity("newagent");
    const agent = agents.findById("newagent");
    expect(agent).toBeDefined();
    expect(agent!.role).toBe("");
  });
});
