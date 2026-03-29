import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../database/index.js";
import { PRIORITIES } from "../types/index.js";
import { generateId } from "../utils/id.js";

export function registerMessagingTools(server: McpServer): void {
  server.tool(
    "msg_send",
    "Send a message to another agent. Supports deduplication and threading.",
    {
      sender: z.string().describe("Sender agent name"),
      recipient: z.string().describe("Recipient agent name"),
      subject: z.string().min(1).describe("Message subject"),
      body: z.string().min(1).describe("Message body"),
      priority: z.enum(PRIORITIES).default("normal").describe("Priority: high, normal, low"),
      thread_id: z.string().optional().describe("Thread ID for conversation continuity"),
      dedup_key: z.string().optional().describe("Deduplication key to prevent duplicate processing"),
    },
    async ({ sender, recipient, subject, body, priority, thread_id, dedup_key }) => {
      const db = getDb();

      if (dedup_key) {
        const exists = db.prepare(`SELECT id FROM messages WHERE dedup_key = ?`).get(dedup_key);
        if (exists) {
          return { content: [{ type: "text" as const, text: JSON.stringify({ sent: false, reason: "duplicate", dedup_key }) }] };
        }
      }

      let tid = thread_id || null;
      if (!tid) {
        tid = generateId("thr");
        const participants = JSON.stringify([sender, recipient]);
        db.prepare(`INSERT INTO threads (id, subject, participants) VALUES (?, ?, ?)`).run(tid, subject, participants);
      } else {
        const thread = db.prepare(`SELECT participants FROM threads WHERE id = ?`).get(tid) as { participants: string } | undefined;
        if (thread) {
          const parts: string[] = JSON.parse(thread.participants);
          const updated = [...new Set([...parts, sender, recipient])];
          db.prepare(`UPDATE threads SET participants = ?, updated_at = datetime('now') WHERE id = ?`).run(JSON.stringify(updated), tid);
        }
      }

      const id = generateId("msg");
      const ttl = parseInt(process.env.MAILBOX_TTL || "86400", 10);
      const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

      db.prepare(
        `INSERT INTO messages (id, sender, recipient, subject, body, priority, thread_id, dedup_key, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, sender, recipient, subject, body, priority, tid, dedup_key || null, expiresAt);

      db.prepare(`UPDATE agent_registry SET last_active = datetime('now') WHERE id = ?`).run(sender);

      return { content: [{ type: "text" as const, text: JSON.stringify({ sent: true, message_id: id, thread_id: tid, recipient, priority }) }] };
    }
  );

  server.tool(
    "msg_read_inbox",
    "Read unread messages for an agent. Messages are marked as delivered.",
    {
      agent: z.string().describe("Agent name (recipient)"),
      limit: z.number().default(10).describe("Max messages to return"),
    },
    async ({ agent, limit }) => {
      const db = getDb();

      db.prepare(`DELETE FROM messages WHERE expires_at < datetime('now') AND status = 'pending'`).run();

      const messages = db.prepare(
        `SELECT * FROM messages WHERE recipient = ? AND status IN ('pending', 'delivered')
         ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 END, created_at ASC
         LIMIT ?`
      ).all(agent, limit);

      const ids = messages.map((m: any) => m.id);
      if (ids.length > 0) {
        const placeholders = ids.map(() => "?").join(",");
        db.prepare(`UPDATE messages SET status = 'delivered', delivered_at = datetime('now') WHERE id IN (${placeholders}) AND status = 'pending'`).run(...ids);
      }

      db.prepare(`INSERT INTO agent_registry (id, role, last_active) VALUES (?, '', datetime('now')) ON CONFLICT(id) DO UPDATE SET last_active = datetime('now')`).run(agent);

      return { content: [{ type: "text" as const, text: JSON.stringify({ agent, count: messages.length, messages }) }] };
    }
  );

  server.tool(
    "msg_acknowledge",
    "Acknowledge a message as processed. Optionally send a reply back to the sender.",
    {
      message_id: z.string().describe("Message ID to acknowledge"),
      reply_body: z.string().optional().describe("Optional reply message body"),
    },
    async ({ message_id, reply_body }) => {
      const db = getDb();
      const msg = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(message_id) as any;

      if (!msg) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Message not found" }) }] };
      }

      db.prepare(`UPDATE messages SET status = 'acked', acked_at = datetime('now') WHERE id = ?`).run(message_id);

      let reply_id: string | null = null;
      if (reply_body) {
        reply_id = generateId("msg");
        const ttl = parseInt(process.env.MAILBOX_TTL || "86400", 10);
        const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
        db.prepare(
          `INSERT INTO messages (id, sender, recipient, subject, body, priority, thread_id, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(reply_id, msg.recipient, msg.sender, `Re: ${msg.subject}`, reply_body, msg.priority, msg.thread_id, expiresAt);
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({ acknowledged: true, message_id, reply_id }) }] };
    }
  );

  server.tool(
    "msg_broadcast",
    "Send a message to all registered agents.",
    {
      sender: z.string().describe("Sender agent name"),
      subject: z.string().min(1).describe("Message subject"),
      body: z.string().min(1).describe("Message body"),
      priority: z.enum(PRIORITIES).default("normal"),
    },
    async ({ sender, subject, body, priority }) => {
      const db = getDb();
      const agents = db.prepare(`SELECT id FROM agent_registry WHERE id != ?`).all(sender) as Array<{ id: string }>;

      const tid = generateId("thr");
      const participants = JSON.stringify([sender, ...agents.map(a => a.id)]);
      db.prepare(`INSERT INTO threads (id, subject, participants) VALUES (?, ?, ?)`).run(tid, subject, participants);

      const ttl = parseInt(process.env.MAILBOX_TTL || "86400", 10);
      const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
      const insert = db.prepare(
        `INSERT INTO messages (id, sender, recipient, subject, body, priority, thread_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );

      const ids: string[] = [];
      const tx = db.transaction(() => {
        for (const agent of agents) {
          const id = generateId("msg");
          insert.run(id, sender, agent.id, subject, body, priority, tid, expiresAt);
          ids.push(id);
        }
      });
      tx();

      return { content: [{ type: "text" as const, text: JSON.stringify({ broadcast: true, recipients: agents.length, message_ids: ids, thread_id: tid }) }] };
    }
  );

  server.tool(
    "msg_search",
    "Search messages by content, subject, or sender/recipient.",
    {
      query: z.string().describe("Search query"),
      agent: z.string().optional().describe("Filter by agent (sender or recipient)"),
      limit: z.number().default(20).describe("Max results"),
    },
    async ({ query, agent, limit }) => {
      const db = getDb();
      const likeQuery = `%${query}%`;

      const messages = agent
        ? db.prepare(
            `SELECT * FROM messages WHERE (sender = ? OR recipient = ?) AND (subject LIKE ? OR body LIKE ?) ORDER BY created_at DESC LIMIT ?`
          ).all(agent, agent, likeQuery, likeQuery, limit)
        : db.prepare(
            `SELECT * FROM messages WHERE subject LIKE ? OR body LIKE ? ORDER BY created_at DESC LIMIT ?`
          ).all(likeQuery, likeQuery, limit);

      return { content: [{ type: "text" as const, text: JSON.stringify({ query, count: messages.length, messages }) }] };
    }
  );

  server.tool(
    "msg_threads",
    "List conversation threads for an agent.",
    {
      agent: z.string().describe("Agent name"),
      limit: z.number().default(10).describe("Max threads"),
    },
    async ({ agent, limit }) => {
      const db = getDb();
      const threads = db.prepare(
        `SELECT t.*, COUNT(m.id) as message_count,
                SUM(CASE WHEN m.recipient = ? AND m.status IN ('pending','delivered') THEN 1 ELSE 0 END) as unread
         FROM threads t
         LEFT JOIN messages m ON m.thread_id = t.id
         WHERE t.participants LIKE ?
         GROUP BY t.id
         ORDER BY t.updated_at DESC LIMIT ?`
      ).all(agent, `%${agent}%`, limit);

      return { content: [{ type: "text" as const, text: JSON.stringify({ agent, threads }) }] };
    }
  );
}
