import type Database from "better-sqlite3";
import { generateId } from "../../utils/id.js";
import { encrypt, decrypt, isEncryptionEnabled } from "../../crypto/encryption.js";

export interface InsertMessageParams {
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  priority: string;
  thread_id: string | null;
  dedup_key?: string | null;
  expires_at: string;
}

export class MessageRepository {
  constructor(readonly db: Database.Database) {}

  insert(params: InsertMessageParams): string {
    const id = generateId("msg");
    this.db
      .prepare(
        `INSERT INTO messages (id, sender, recipient, subject, body, priority, thread_id, dedup_key, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        params.sender,
        params.recipient,
        params.subject,
        encrypt(params.body),
        params.priority,
        params.thread_id,
        params.dedup_key || null,
        params.expires_at
      );
    return id;
  }

  findById(id: string): Record<string, unknown> | undefined {
    const row = this.db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.decryptRow(row) : undefined;
  }

  findByRecipient(
    recipient: string,
    limit: number
  ): Array<Record<string, unknown>> {
    const rows = this.db
      .prepare(
        `SELECT * FROM messages WHERE recipient = ? AND status IN ('pending', 'delivered')
         ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 END, created_at ASC
         LIMIT ?`
      )
      .all(recipient, limit) as Array<Record<string, unknown>>;
    return this.decryptRows(rows);
  }

  markDelivered(ids: string[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(",");
    this.db
      .prepare(
        `UPDATE messages SET status = 'delivered', delivered_at = datetime('now') WHERE id IN (${placeholders}) AND status = 'pending'`
      )
      .run(...ids);
  }

  updateStatus(id: string, status: string): boolean {
    const result = this.db
      .prepare(`UPDATE messages SET status = ? WHERE id = ?`)
      .run(status, id);
    return result.changes > 0;
  }

  acknowledge(id: string): void {
    this.db
      .prepare(
        `UPDATE messages SET status = 'acked', acked_at = datetime('now') WHERE id = ?`
      )
      .run(id);
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM messages WHERE id = ?`)
      .run(id);
    return result.changes > 0;
  }

  search(
    query: string,
    agent?: string,
    limit: number = 20,
    offset: number = 0
  ): Array<Record<string, unknown>> {
    const likeQuery = `%${query}%`;
    let rows: Array<Record<string, unknown>>;
    // Note: body is excluded from search because it may be encrypted
    if (agent) {
      rows = this.db
        .prepare(
          `SELECT * FROM messages WHERE (sender = ? OR recipient = ?) AND (subject LIKE ? OR sender LIKE ? OR recipient LIKE ?) ORDER BY created_at DESC LIMIT ? OFFSET ?`
        )
        .all(agent, agent, likeQuery, likeQuery, likeQuery, limit, offset) as Array<Record<string, unknown>>;
    } else {
      rows = this.db
        .prepare(
          `SELECT * FROM messages WHERE subject LIKE ? OR sender LIKE ? OR recipient LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
        )
        .all(likeQuery, likeQuery, likeQuery, limit, offset) as Array<Record<string, unknown>>;
    }
    return this.decryptRows(rows);
  }

  countByStatus(recipient: string): Record<string, number> {
    const rows = this.db
      .prepare(
        `SELECT status, COUNT(*) as count FROM messages WHERE recipient = ? GROUP BY status`
      )
      .all(recipient) as Array<{ status: string; count: number }>;

    const counts: Record<string, number> = {
      pending: 0,
      delivered: 0,
      acked: 0,
    };
    for (const row of rows) {
      counts[row.status] = row.count;
    }
    return counts;
  }

  expirePending(): void {
    // Move expired messages to DLQ if table exists, then delete
    try {
      const expired = this.db
        .prepare(
          `SELECT * FROM messages WHERE expires_at < datetime('now') AND status = 'pending'`
        )
        .all() as Array<Record<string, unknown>>;

      if (expired.length > 0) {
        const hasDlq = this.db
          .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='dead_letter_queue'`)
          .get();

        if (hasDlq) {
          const insertDlq = this.db.prepare(
            `INSERT INTO dead_letter_queue (id, original_message_id, sender, recipient, subject, body, reason)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          );
          for (const msg of expired) {
            const dlqId = `dlq-${(msg.id as string).replace("msg-", "")}`;
            try {
              insertDlq.run(dlqId, msg.id, msg.sender, msg.recipient, msg.subject, msg.body, "expired");
            } catch {
              // Ignore duplicate or other errors
            }
          }
        }
      }
    } catch {
      // Fallback: just delete
    }

    this.db
      .prepare(
        `DELETE FROM messages WHERE expires_at < datetime('now') AND status = 'pending'`
      )
      .run();
  }

  hasDedupKey(dedupKey: string): boolean {
    return !!this.db
      .prepare(`SELECT id FROM messages WHERE dedup_key = ?`)
      .get(dedupKey);
  }

  findReplyInThread(
    threadId: string,
    fromAgent: string,
    toAgent: string,
    excludeId: string
  ): Record<string, unknown> | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM messages WHERE thread_id = ? AND sender = ? AND recipient = ? AND id != ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(threadId, fromAgent, toAgent, excludeId) as
      | Record<string, unknown>
      | undefined;
    return row ? this.decryptRow(row) : undefined;
  }

  findActivitySince(
    cutoff: string
  ): Array<Record<string, unknown>> {
    return this.db
      .prepare(
        `SELECT id, sender, recipient, subject, priority, status, created_at
         FROM messages WHERE created_at >= ? ORDER BY created_at DESC`
      )
      .all(cutoff) as Array<Record<string, unknown>>;
  }

  getActivityStats(
    cutoff: string
  ): Record<string, unknown> {
    return this.db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
           SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
           SUM(CASE WHEN status = 'acked' THEN 1 ELSE 0 END) as acked
         FROM messages WHERE created_at >= ?`
      )
      .get(cutoff) as Record<string, unknown>;
  }

  private decryptRow(row: Record<string, unknown>): Record<string, unknown> {
    if (row.body && typeof row.body === "string") {
      row.body = decrypt(row.body);
    }
    return row;
  }

  private decryptRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    return rows.map((r) => this.decryptRow(r));
  }
}
