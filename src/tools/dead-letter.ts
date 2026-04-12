import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../database/index.js";
import { getRepos } from "../database/index.js";
import { DeadLetterRepository } from "../database/repositories/dead-letter.js";
import { loadConfig } from "../config.js";

function getDlqRepo(): DeadLetterRepository {
  return new DeadLetterRepository(getDb());
}

export function registerDeadLetterTools(server: McpServer): void {
  server.tool(
    "dlq_list",
    "List messages in the dead-letter queue. These are messages that expired or failed delivery.",
    {
      limit: z.number().min(1).max(100).default(50).describe("Max entries to return"),
      offset: z.number().min(0).default(0).describe("Offset for pagination"),
    },
    async ({ limit, offset }) => {
      const dlq = getDlqRepo();
      const entries = dlq.list(limit, offset);
      const total = dlq.count();

      return { content: [{ type: "text" as const, text: JSON.stringify({
        count: entries.length,
        total,
        entries,
      }) }] };
    }
  );

  server.tool(
    "dlq_retry",
    "Retry a dead-letter message by re-inserting it as a new pending message.",
    {
      dlq_id: z.string().min(1).max(256).describe("Dead-letter queue entry ID"),
    },
    async ({ dlq_id }) => {
      const dlq = getDlqRepo();
      const entry = dlq.findById(dlq_id);

      if (!entry) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "DLQ entry not found" }) }] };
      }

      // Re-insert as new message
      const { messages, threads } = getRepos();
      const tid = threads.create(`Retry: ${entry.subject}`, [entry.sender, entry.recipient]);
      const ttl = loadConfig().ttlSeconds;
      const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

      const newId = messages.insert({
        sender: entry.sender,
        recipient: entry.recipient,
        subject: entry.subject,
        body: entry.body,
        priority: "normal",
        thread_id: tid,
        expires_at: expiresAt,
      });

      dlq.incrementRetry(dlq_id);
      dlq.delete(dlq_id);

      return { content: [{ type: "text" as const, text: JSON.stringify({
        retried: true,
        dlq_id,
        new_message_id: newId,
        retry_count: entry.retry_count + 1,
      }) }] };
    }
  );

  server.tool(
    "dlq_purge",
    "Remove all entries from the dead-letter queue.",
    {},
    async () => {
      const dlq = getDlqRepo();
      const removed = dlq.purge();

      return { content: [{ type: "text" as const, text: JSON.stringify({
        purged: true,
        removed,
      }) }] };
    }
  );
}
