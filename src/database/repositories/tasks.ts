import type Database from "better-sqlite3";
import { generateId } from "../../utils/id.js";
import type { TaskState, Part, A2ATask, TaskMessage, TaskArtifact } from "../../types/a2a.js";
import { VALID_TRANSITIONS, TERMINAL_STATES } from "../../types/a2a.js";

export interface CreateTaskParams {
  from_agent: string;
  to_agent: string;
  session_id?: string;
  metadata?: Record<string, unknown>;
}

export class TaskRepository {
  constructor(readonly db: Database.Database) {}

  create(params: CreateTaskParams): string {
    const id = generateId("task");
    this.db
      .prepare(
        `INSERT INTO a2a_tasks (id, session_id, from_agent, to_agent, metadata)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        id,
        params.session_id || null,
        params.from_agent,
        params.to_agent,
        JSON.stringify(params.metadata || {})
      );
    return id;
  }

  findById(id: string): A2ATask | undefined {
    const row = this.db
      .prepare(`SELECT * FROM a2a_tasks WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.rowToTask(row);
  }

  findByIdWithDetails(id: string): A2ATask | undefined {
    const task = this.findById(id);
    if (!task) return undefined;

    task.messages = this.getMessages(id);
    task.artifacts = this.getArtifacts(id);
    return task;
  }

  updateStatus(id: string, newStatus: TaskState): boolean {
    const task = this.findById(id);
    if (!task) return false;

    const allowed = VALID_TRANSITIONS[task.status];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid transition: ${task.status} → ${newStatus}. Allowed: ${allowed.join(", ") || "none (terminal state)"}`
      );
    }

    this.db
      .prepare(
        `UPDATE a2a_tasks SET status = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .run(newStatus, id);
    return true;
  }

  addMessage(taskId: string, role: "user" | "agent", parts: Part[]): string {
    const id = generateId("tmsg");
    this.db
      .prepare(
        `INSERT INTO a2a_task_messages (id, task_id, role, parts) VALUES (?, ?, ?, ?)`
      )
      .run(id, taskId, role, JSON.stringify(parts));

    this.db
      .prepare(`UPDATE a2a_tasks SET updated_at = datetime('now') WHERE id = ?`)
      .run(taskId);

    return id;
  }

  addArtifact(
    taskId: string,
    parts: Part[],
    name?: string,
    description?: string
  ): string {
    const id = generateId("art");
    this.db
      .prepare(
        `INSERT INTO a2a_task_artifacts (id, task_id, name, description, parts) VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, taskId, name || null, description || null, JSON.stringify(parts));

    this.db
      .prepare(`UPDATE a2a_tasks SET updated_at = datetime('now') WHERE id = ?`)
      .run(taskId);

    return id;
  }

  getMessages(taskId: string): TaskMessage[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM a2a_task_messages WHERE task_id = ? ORDER BY created_at ASC`
      )
      .all(taskId) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: r.id as string,
      task_id: r.task_id as string,
      role: r.role as "user" | "agent",
      parts: JSON.parse(r.parts as string),
      created_at: r.created_at as string,
    }));
  }

  getArtifacts(taskId: string): TaskArtifact[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM a2a_task_artifacts WHERE task_id = ? ORDER BY created_at ASC`
      )
      .all(taskId) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: r.id as string,
      task_id: r.task_id as string,
      name: (r.name as string) || undefined,
      description: (r.description as string) || undefined,
      parts: JSON.parse(r.parts as string),
      created_at: r.created_at as string,
    }));
  }

  findByAgent(
    agent: string,
    role: "from" | "to",
    limit: number = 20,
    offset: number = 0
  ): A2ATask[] {
    const column = role === "from" ? "from_agent" : "to_agent";
    const rows = this.db
      .prepare(
        `SELECT * FROM a2a_tasks WHERE ${column} = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?`
      )
      .all(agent, limit, offset) as Array<Record<string, unknown>>;

    return rows.map((r) => this.rowToTask(r));
  }

  findBySession(sessionId: string): A2ATask[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM a2a_tasks WHERE session_id = ? ORDER BY created_at ASC`
      )
      .all(sessionId) as Array<Record<string, unknown>>;

    return rows.map((r) => this.rowToTask(r));
  }

  countByAgent(agent: string): Record<string, number> {
    const rows = this.db
      .prepare(
        `SELECT status, COUNT(*) as count FROM a2a_tasks WHERE to_agent = ? GROUP BY status`
      )
      .all(agent) as Array<{ status: string; count: number }>;

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.status] = row.count;
    }
    return counts;
  }

  private rowToTask(row: Record<string, unknown>): A2ATask {
    return {
      id: row.id as string,
      session_id: (row.session_id as string) || undefined,
      from_agent: row.from_agent as string,
      to_agent: row.to_agent as string,
      status: row.status as TaskState,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      metadata: JSON.parse((row.metadata as string) || "{}"),
    };
  }
}
