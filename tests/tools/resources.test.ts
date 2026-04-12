import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { LeaseRepository } from "../../src/database/repositories/leases.js";
import { initFromDb } from "../../src/database/index.js";

let db: Database.Database;
let leases: LeaseRepository;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const repos = initFromDb(db);
  leases = repos.leases;
});

afterEach(() => {
  db.close();
});

describe("LeaseRepository", () => {
  it("acquires an exclusive lease", () => {
    const result = leases.acquire("file.txt", "alice", "exclusive", 300);
    expect(result.acquired).toBe(true);
  });

  it("rejects second exclusive lease on same resource", () => {
    leases.acquire("file.txt", "alice", "exclusive", 300);
    const result = leases.acquire("file.txt", "bob", "exclusive", 300);
    expect(result.acquired).toBe(false);
    expect(result.holder?.agent_id).toBe("alice");
  });

  it("allows same agent to renew lease", () => {
    leases.acquire("file.txt", "alice", "exclusive", 300);
    const result = leases.acquire("file.txt", "alice", "exclusive", 600);
    expect(result.acquired).toBe(true);
  });

  it("releases a lease", () => {
    leases.acquire("file.txt", "alice", "exclusive", 300);
    const released = leases.release("file.txt", "alice");
    expect(released).toBe(true);

    // Now bob can acquire
    const result = leases.acquire("file.txt", "bob", "exclusive", 300);
    expect(result.acquired).toBe(true);
  });

  it("returns false when releasing non-existent lease", () => {
    expect(leases.release("nonexistent", "alice")).toBe(false);
  });

  it("checks lease status", () => {
    leases.acquire("file.txt", "alice", "exclusive", 300);
    const lease = leases.check("file.txt");
    expect(lease).not.toBeNull();
    expect(lease!.agent_id).toBe("alice");
    expect(lease!.lease_type).toBe("exclusive");
  });

  it("returns null for unclaimed resource", () => {
    expect(leases.check("unclaimed")).toBeNull();
  });

  it("lists all active leases", () => {
    leases.acquire("file1.txt", "alice", "exclusive", 300);
    leases.acquire("file2.txt", "bob", "shared", 300);
    const list = leases.listAll();
    expect(list).toHaveLength(2);
  });

  it("stores metadata", () => {
    leases.acquire("file.txt", "alice", "exclusive", 300, { purpose: "editing" });
    const lease = leases.check("file.txt");
    expect(lease!.metadata).toEqual({ purpose: "editing" });
  });
});
