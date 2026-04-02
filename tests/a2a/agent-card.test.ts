import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { getServerAgentCard, getAgentCard } from "../../src/a2a/agent-card.js";
import { initFromDb } from "../../src/database/index.js";

let db: Database.Database;

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
  initFromDb(db);
});

afterEach(() => {
  db.close();
});

describe("Agent Cards", () => {
  describe("getServerAgentCard", () => {
    it("returns a valid server agent card", () => {
      const card = getServerAgentCard();

      expect(card.name).toBe("agent-mailbox-mcp");
      expect(card.description).toBeTruthy();
      expect(card.url).toContain("/a2a");
      expect(card.version).toBe("1.0.0");
      expect(card.capabilities).toBeDefined();
      expect(card.capabilities.stateTransitionHistory).toBe(true);
      expect(card.skills).toHaveLength(3);
      expect(card.defaultInputModes).toContain("application/json");
      expect(card.defaultOutputModes).toContain("application/json");
    });

    it("has messaging, task-management, and agent-registry skills", () => {
      const card = getServerAgentCard();
      const skillIds = card.skills.map((s) => s.id);
      expect(skillIds).toContain("messaging");
      expect(skillIds).toContain("task-management");
      expect(skillIds).toContain("agent-registry");
    });
  });

  describe("getAgentCard", () => {
    it("returns null for non-existent agent", () => {
      const card = getAgentCard("nonexistent");
      expect(card).toBeNull();
    });

    it("returns card for registered agent", () => {
      const repos = initFromDb(db);
      repos.agents.register("test-agent", "worker");

      const card = getAgentCard("test-agent");
      expect(card).not.toBeNull();
      expect(card!.name).toBe("test-agent");
      expect(card!.url).toContain("/a2a");
      expect(card!.version).toBeTruthy();
    });

    it("includes agent description when available", () => {
      const repos = initFromDb(db);
      repos.agents.register({
        name: "smart-agent",
        role: "analyzer",
        description: "An agent that analyzes data",
        version: "2.0.0",
      });

      const card = getAgentCard("smart-agent");
      expect(card).not.toBeNull();
      expect(card!.description).toBe("An agent that analyzes data");
      expect(card!.version).toBe("2.0.0");
    });
  });
});
