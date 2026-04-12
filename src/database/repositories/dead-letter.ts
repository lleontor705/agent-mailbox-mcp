import type Database from "better-sqlite3";
import { generateId } from "../../utils/id.js";

export interface DeadLetterEntry {
  id: string;
  original_message_id: string;
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  reason: string;
  moved_at: string;
  retry_count: number;
  last_retry_at: string | null;
}

export class DeadLetterRepository {
  constructor(readonly db: Database.Database) {}

  moveToDeadLetter(
    message: Record<string, unknown>,
    reason: string
  ): string {
    const id = generateId("dlq");
    this.db
      .prepare(
        `INSERT INTO dead_letter_queue (id, original_message_id, sender, recipient, subject, body, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        message.id as string,
        message.sender as string,
        message.recipient as string,
        message.subject as string,
        message.body as string,
        reason
      );
    return id;
  }

  list(limit: number = 50, offset: number = 0): DeadLetterEntry[] {
    return this.db
      .prepare(
        `SELECT * FROM dead_letter_queue ORDER BY moved_at DESC LIMIT ? OFFSET ?`
      )
      .all(limit, offset) as DeadLetterEntry[];
  }

  findById(id: string): DeadLetterEntry | undefined {
    return this.db
      .prepare(`SELECT * FROM dead_letter_queue WHERE id = ?`)
      .get(id) as DeadLetterEntry | undefined;
  }

  incrementRetry(id: string): void {
    this.db
      .prepare(
        `UPDATE dead_letter_queue SET retry_count = retry_count + 1, last_retry_at = datetime('now') WHERE id = ?`
      )
      .run(id);
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM dead_letter_queue WHERE id = ?`)
      .run(id);
    return result.changes > 0;
  }

  purge(): number {
    const result = this.db
      .prepare(`DELETE FROM dead_letter_queue`)
      .run();
    return result.changes;
  }

  count(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM dead_letter_queue`)
      .get() as { count: number };
    return row.count;
  }
}
