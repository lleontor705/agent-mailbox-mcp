import type Database from "better-sqlite3";

export interface RegisterAgentParams {
  name: string;
  role?: string;
  description?: string;
  url?: string;
  skills?: string; // JSON array
  version?: string;
}

export class AgentRepository {
  constructor(private db: Database.Database) {}

  register(nameOrParams: string | RegisterAgentParams, role: string = ""): void {
    if (typeof nameOrParams === "string") {
      // Simple registration (backward compatible)
      this.db
        .prepare(
          `INSERT INTO agent_registry (id, role) VALUES (?, ?)
           ON CONFLICT(id) DO UPDATE SET role = ?, last_active = datetime('now')`
        )
        .run(nameOrParams, role, role);
      return;
    }

    // Extended registration with Agent Card fields
    const p = nameOrParams;
    const hasCardColumns = this.hasColumn("description");

    if (hasCardColumns) {
      this.db
        .prepare(
          `INSERT INTO agent_registry (id, role, description, url, skills, version)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             role = ?, description = ?, url = ?, skills = ?, version = ?,
             last_active = datetime('now')`
        )
        .run(
          p.name,
          p.role || "",
          p.description || "",
          p.url || "",
          p.skills || "[]",
          p.version || "1.0.0",
          p.role || "",
          p.description || "",
          p.url || "",
          p.skills || "[]",
          p.version || "1.0.0"
        );
    } else {
      // Fallback for pre-migration databases
      this.db
        .prepare(
          `INSERT INTO agent_registry (id, role) VALUES (?, ?)
           ON CONFLICT(id) DO UPDATE SET role = ?, last_active = datetime('now')`
        )
        .run(p.name, p.role || "", p.role || "");
    }
  }

  findById(
    id: string
  ): Record<string, unknown> | undefined {
    return this.db
      .prepare(`SELECT * FROM agent_registry WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
  }

  listAll(): Array<Record<string, unknown>> {
    return this.db
      .prepare(`SELECT * FROM agent_registry ORDER BY last_active DESC`)
      .all() as Array<Record<string, unknown>>;
  }

  listAllExcept(agentId: string): Array<{ id: string }> {
    return this.db
      .prepare(`SELECT id FROM agent_registry WHERE id != ?`)
      .all(agentId) as Array<{ id: string }>;
  }

  updateActivity(agentId: string): void {
    this.db
      .prepare(
        `INSERT INTO agent_registry (id, role, last_active) VALUES (?, '', datetime('now'))
         ON CONFLICT(id) DO UPDATE SET last_active = datetime('now')`
      )
      .run(agentId);
  }

  private hasColumn(columnName: string): boolean {
    try {
      const cols = this.db
        .prepare(`PRAGMA table_info(agent_registry)`)
        .all() as Array<{ name: string }>;
      return cols.some((c) => c.name === columnName);
    } catch {
      return false;
    }
  }
}
