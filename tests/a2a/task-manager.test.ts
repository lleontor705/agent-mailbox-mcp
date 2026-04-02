import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { TaskManager } from "../../src/a2a/task-manager.js";
import { initFromDb } from "../../src/database/index.js";

let db: Database.Database;

// Mock getRepos to use our test database
vi.mock("../../src/database/index.js", async (importOriginal) => {
  const original = await importOriginal() as any;
  return {
    ...original,
    getRepos: () => original.initFromDb(db),
  };
});

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const repos = initFromDb(db);
  // Register test agents
  repos.agents.register("alice", "requester");
  repos.agents.register("bob", "worker");
});

afterEach(() => {
  db.close();
});

describe("TaskManager", () => {
  const manager = new TaskManager();

  describe("submit", () => {
    it("creates a task with initial message", () => {
      const result = manager.submit({
        from_agent: "alice",
        to_agent: "bob",
        message: { role: "user", parts: [{ type: "text", text: "Please process this" }] },
      });

      expect(result.success).toBe(true);
      expect(result.task).toBeDefined();
      expect(result.task!.id).toMatch(/^task-/);
      expect(result.task!.status).toBe("submitted");
      expect(result.task!.from_agent).toBe("alice");
      expect(result.task!.to_agent).toBe("bob");
      expect(result.task!.messages).toHaveLength(1);
      expect(result.task!.messages![0].role).toBe("user");
    });

    it("fails when target agent does not exist", () => {
      const result = manager.submit({
        from_agent: "alice",
        to_agent: "nonexistent",
        message: { role: "user", parts: [{ type: "text", text: "hello" }] },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("supports session_id and metadata", () => {
      const result = manager.submit({
        from_agent: "alice",
        to_agent: "bob",
        message: { role: "user", parts: [{ type: "text", text: "task" }] },
        session_id: "session-1",
        metadata: { priority: "high" },
      });

      expect(result.success).toBe(true);
      expect(result.task!.session_id).toBe("session-1");
      expect(result.task!.metadata).toEqual({ priority: "high" });
    });
  });

  describe("getTask", () => {
    it("retrieves task with full details", () => {
      const submitted = manager.submit({
        from_agent: "alice",
        to_agent: "bob",
        message: { role: "user", parts: [{ type: "text", text: "data" }] },
      });

      const result = manager.getTask(submitted.task!.id);
      expect(result.success).toBe(true);
      expect(result.task!.messages).toHaveLength(1);
      expect(result.task!.artifacts).toHaveLength(0);
    });

    it("returns error for non-existent task", () => {
      const result = manager.getTask("task-nonexistent");
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("updateStatus", () => {
    it("transitions submitted → working", () => {
      const submitted = manager.submit({
        from_agent: "alice",
        to_agent: "bob",
        message: { role: "user", parts: [{ type: "text", text: "work" }] },
      });

      const result = manager.updateStatus(submitted.task!.id, "working");
      expect(result.success).toBe(true);
      expect(result.task!.status).toBe("working");
    });

    it("transitions working → completed", () => {
      const submitted = manager.submit({
        from_agent: "alice",
        to_agent: "bob",
        message: { role: "user", parts: [{ type: "text", text: "work" }] },
      });
      manager.updateStatus(submitted.task!.id, "working");

      const result = manager.updateStatus(submitted.task!.id, "completed");
      expect(result.success).toBe(true);
      expect(result.task!.status).toBe("completed");
    });

    it("rejects invalid transition submitted → completed", () => {
      const submitted = manager.submit({
        from_agent: "alice",
        to_agent: "bob",
        message: { role: "user", parts: [{ type: "text", text: "work" }] },
      });

      const result = manager.updateStatus(submitted.task!.id, "completed");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid transition");
    });

    it("rejects transitions from terminal states", () => {
      const submitted = manager.submit({
        from_agent: "alice",
        to_agent: "bob",
        message: { role: "user", parts: [{ type: "text", text: "work" }] },
      });
      manager.updateStatus(submitted.task!.id, "working");
      manager.updateStatus(submitted.task!.id, "completed");

      const result = manager.updateStatus(submitted.task!.id, "working");
      expect(result.success).toBe(false);
      expect(result.error).toContain("terminal state");
    });

    it("allows adding a message with status update", () => {
      const submitted = manager.submit({
        from_agent: "alice",
        to_agent: "bob",
        message: { role: "user", parts: [{ type: "text", text: "work" }] },
      });

      const result = manager.updateStatus(submitted.task!.id, "working", {
        role: "agent",
        parts: [{ type: "text", text: "On it!" }],
      });

      expect(result.success).toBe(true);
      expect(result.task!.messages).toHaveLength(2);
    });
  });

  describe("cancel", () => {
    it("cancels a submitted task", () => {
      const submitted = manager.submit({
        from_agent: "alice",
        to_agent: "bob",
        message: { role: "user", parts: [{ type: "text", text: "work" }] },
      });

      const result = manager.cancel(submitted.task!.id);
      expect(result.success).toBe(true);
      expect(result.task!.status).toBe("canceled");
    });

    it("cancels a working task", () => {
      const submitted = manager.submit({
        from_agent: "alice",
        to_agent: "bob",
        message: { role: "user", parts: [{ type: "text", text: "work" }] },
      });
      manager.updateStatus(submitted.task!.id, "working");

      const result = manager.cancel(submitted.task!.id);
      expect(result.success).toBe(true);
      expect(result.task!.status).toBe("canceled");
    });
  });

  describe("respond", () => {
    it("completes a task with response and artifact", () => {
      const submitted = manager.submit({
        from_agent: "alice",
        to_agent: "bob",
        message: { role: "user", parts: [{ type: "text", text: "analyze data" }] },
      });
      manager.updateStatus(submitted.task!.id, "working");

      const result = manager.respond(
        submitted.task!.id,
        [{ type: "text", text: "Analysis complete" }],
        "completed",
        "analysis-result",
        "Final analysis output"
      );

      expect(result.success).toBe(true);
      expect(result.task!.status).toBe("completed");
      expect(result.task!.messages).toHaveLength(2); // initial + response
      expect(result.task!.artifacts).toHaveLength(1);
      expect(result.task!.artifacts![0].name).toBe("analysis-result");
    });

    it("can set status to input-required", () => {
      const submitted = manager.submit({
        from_agent: "alice",
        to_agent: "bob",
        message: { role: "user", parts: [{ type: "text", text: "process" }] },
      });
      manager.updateStatus(submitted.task!.id, "working");

      const result = manager.respond(
        submitted.task!.id,
        [{ type: "text", text: "Need more info" }],
        "input-required"
      );

      expect(result.success).toBe(true);
      expect(result.task!.status).toBe("input-required");
      expect(result.task!.artifacts).toHaveLength(0); // no artifact for non-terminal
    });
  });

  describe("listTasks", () => {
    it("lists tasks assigned to an agent", () => {
      manager.submit({
        from_agent: "alice",
        to_agent: "bob",
        message: { role: "user", parts: [{ type: "text", text: "task 1" }] },
      });
      manager.submit({
        from_agent: "alice",
        to_agent: "bob",
        message: { role: "user", parts: [{ type: "text", text: "task 2" }] },
      });

      const tasks = manager.listTasks("bob", "to");
      expect(tasks).toHaveLength(2);
    });

    it("lists tasks sent by an agent", () => {
      manager.submit({
        from_agent: "alice",
        to_agent: "bob",
        message: { role: "user", parts: [{ type: "text", text: "task 1" }] },
      });

      const tasks = manager.listTasks("alice", "from");
      expect(tasks).toHaveLength(1);
      expect(tasks[0].from_agent).toBe("alice");
    });

    it("supports pagination", () => {
      for (let i = 0; i < 5; i++) {
        manager.submit({
          from_agent: "alice",
          to_agent: "bob",
          message: { role: "user", parts: [{ type: "text", text: `task ${i}` }] },
        });
      }

      const page1 = manager.listTasks("bob", "to", 2, 0);
      const page2 = manager.listTasks("bob", "to", 2, 2);
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });
});
