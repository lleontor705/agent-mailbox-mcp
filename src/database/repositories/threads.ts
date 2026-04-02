import type Database from "better-sqlite3";
import { generateId } from "../../utils/id.js";

export class ThreadRepository {
  constructor(private db: Database.Database) {}

  create(subject: string, participants: string[]): string {
    const id = generateId("thr");
    this.db
      .prepare(`INSERT INTO threads (id, subject, participants) VALUES (?, ?, ?)`)
      .run(id, subject, JSON.stringify(participants));

    // Also populate junction table if it exists
    this.syncParticipants(id, participants);
    return id;
  }

  findById(
    id: string
  ): { id: string; subject: string; participants: string; created_at: string; updated_at: string } | undefined {
    return this.db
      .prepare(`SELECT * FROM threads WHERE id = ?`)
      .get(id) as any;
  }

  updateParticipants(threadId: string, participants: string[]): void {
    this.db
      .prepare(
        `UPDATE threads SET participants = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .run(JSON.stringify(participants), threadId);

    this.syncParticipants(threadId, participants);
  }

  addParticipants(threadId: string, newAgents: string[]): string[] {
    const thread = this.findById(threadId);
    if (!thread) return newAgents;

    const existing: string[] = JSON.parse(thread.participants);
    const merged = [...new Set([...existing, ...newAgents])];
    this.updateParticipants(threadId, merged);
    return merged;
  }

  findByParticipant(
    agent: string,
    limit: number = 10
  ): Array<Record<string, unknown>> {
    // Use junction table for reliable lookup
    const hasJunction = this.hasJunctionTable();
    if (hasJunction) {
      return this.db
        .prepare(
          `SELECT t.*, COUNT(m.id) as message_count,
                  SUM(CASE WHEN m.recipient = ? AND m.status IN ('pending','delivered') THEN 1 ELSE 0 END) as unread
           FROM threads t
           INNER JOIN thread_participants tp ON tp.thread_id = t.id AND tp.agent_id = ?
           LEFT JOIN messages m ON m.thread_id = t.id
           GROUP BY t.id
           ORDER BY t.updated_at DESC LIMIT ?`
        )
        .all(agent, agent, limit) as Array<Record<string, unknown>>;
    }

    // Fallback to LIKE query for pre-migration databases
    return this.db
      .prepare(
        `SELECT t.*, COUNT(m.id) as message_count,
                SUM(CASE WHEN m.recipient = ? AND m.status IN ('pending','delivered') THEN 1 ELSE 0 END) as unread
         FROM threads t
         LEFT JOIN messages m ON m.thread_id = t.id
         WHERE t.participants LIKE ?
         GROUP BY t.id
         ORDER BY t.updated_at DESC LIMIT ?`
      )
      .all(agent, `%"${agent}"%`, limit) as Array<Record<string, unknown>>;
  }

  private syncParticipants(threadId: string, participants: string[]): void {
    if (!this.hasJunctionTable()) return;

    this.db
      .prepare(`DELETE FROM thread_participants WHERE thread_id = ?`)
      .run(threadId);

    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO thread_participants (thread_id, agent_id) VALUES (?, ?)`
    );
    for (const agent of participants) {
      insert.run(threadId, agent);
    }
  }

  private hasJunctionTable(): boolean {
    const result = this.db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='thread_participants'`
      )
      .get();
    return !!result;
  }
}
