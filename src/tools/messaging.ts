import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getRepos } from "../database/index.js";
import { MESSAGE_STATUSES, PRIORITIES } from "../types/index.js";
import { loadConfig } from "../config.js";
import { eventBus } from "../events/event-bus.js";

function computeExpiresAt(): string {
  const ttl = loadConfig().ttlSeconds;
  return new Date(Date.now() + ttl * 1000).toISOString();
}

export function registerMessagingTools(server: McpServer): void {
  server.tool(
    "msg_send",
    "Send a message to another agent. Supports deduplication and threading.",
    {
      sender: z.string().max(256).regex(/^[a-zA-Z0-9_.-]+$/).describe("Sender agent name"),
      recipient: z.string().max(256).regex(/^[a-zA-Z0-9_.-]+$/).describe("Recipient agent name"),
      subject: z.string().min(1).max(1024).describe("Message subject"),
      body: z.string().min(1).max(65536).describe("Message body"),
      priority: z.enum(PRIORITIES).default("normal").describe("Priority: high, normal, low"),
      thread_id: z.string().max(256).optional().describe("Thread ID for conversation continuity"),
      dedup_key: z.string().max(512).optional().describe("Deduplication key to prevent duplicate processing"),
    },
    async ({ sender, recipient, subject, body, priority, thread_id, dedup_key }) => {
      const { messages, threads, agents } = getRepos();

      if (dedup_key && messages.hasDedupKey(dedup_key)) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ sent: false, reason: "duplicate", dedup_key }) }] };
      }

      let tid = thread_id || null;
      if (!tid) {
        tid = threads.create(subject, [sender, recipient]);
      } else {
        threads.addParticipants(tid, [sender, recipient]);
      }

      const id = messages.insert({
        sender, recipient, subject, body, priority,
        thread_id: tid, dedup_key, expires_at: computeExpiresAt(),
      });

      agents.updateActivity(sender);

      // Notify listeners (used by msg_request to avoid polling)
      eventBus.publish(`message:${recipient}`, { message_id: id, thread_id: tid, sender });

      return { content: [{ type: "text" as const, text: JSON.stringify({ sent: true, message_id: id, thread_id: tid, recipient, priority }) }] };
    }
  );

  server.tool(
    "msg_read_inbox",
    "Read unread messages for an agent. Messages are marked as delivered.",
    {
      agent: z.string().max(256).regex(/^[a-zA-Z0-9_.-]+$/).describe("Agent name (recipient)"),
      limit: z.number().min(1).max(100).default(10).describe("Max messages to return"),
    },
    async ({ agent, limit }) => {
      const { messages, agents } = getRepos();

      messages.expirePending();
      const msgs = messages.findByRecipient(agent, limit);
      const ids = msgs.map((m) => m.id as string);
      messages.markDelivered(ids);
      agents.updateActivity(agent);

      return { content: [{ type: "text" as const, text: JSON.stringify({ agent, count: msgs.length, messages: msgs }) }] };
    }
  );

  server.tool(
    "msg_acknowledge",
    "Acknowledge a message as processed. Optionally send a reply back to the sender.",
    {
      message_id: z.string().max(256).describe("Message ID to acknowledge"),
      reply_body: z.string().max(65536).optional().describe("Optional reply message body"),
    },
    async ({ message_id, reply_body }) => {
      const { messages } = getRepos();
      const msg = messages.findById(message_id);

      if (!msg) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Message not found" }) }] };
      }

      messages.acknowledge(message_id);

      let reply_id: string | null = null;
      if (reply_body) {
        reply_id = messages.insert({
          sender: msg.recipient as string,
          recipient: msg.sender as string,
          subject: `Re: ${msg.subject}`,
          body: reply_body,
          priority: msg.priority as string,
          thread_id: (msg.thread_id as string) || null,
          expires_at: computeExpiresAt(),
        });
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({ acknowledged: true, message_id, reply_id }) }] };
    }
  );

  server.tool(
    "msg_broadcast",
    "Send a message to all registered agents.",
    {
      sender: z.string().max(256).regex(/^[a-zA-Z0-9_.-]+$/).describe("Sender agent name"),
      subject: z.string().min(1).max(1024).describe("Message subject"),
      body: z.string().min(1).max(65536).describe("Message body"),
      priority: z.enum(PRIORITIES).default("normal"),
    },
    async ({ sender, subject, body, priority }) => {
      const { messages, threads, agents } = getRepos();
      const allAgents = agents.listAllExcept(sender);

      const tid = threads.create(subject, [sender, ...allAgents.map((a) => a.id)]);
      const expiresAt = computeExpiresAt();

      const ids: string[] = [];
      const tx = messages.db.transaction(() => {
        for (const agent of allAgents) {
          const id = messages.insert({
            sender, recipient: agent.id, subject, body, priority,
            thread_id: tid, expires_at: expiresAt,
          });
          ids.push(id);
        }
      });
      tx();

      return { content: [{ type: "text" as const, text: JSON.stringify({ broadcast: true, recipients: allAgents.length, message_ids: ids, thread_id: tid }) }] };
    }
  );

  server.tool(
    "msg_search",
    "Search messages by content, subject, or sender/recipient.",
    {
      query: z.string().max(1024).describe("Search query"),
      agent: z.string().max(256).regex(/^[a-zA-Z0-9_.-]+$/).optional().describe("Filter by agent (sender or recipient)"),
      limit: z.number().min(1).max(100).default(20).describe("Max results"),
      offset: z.number().min(0).default(0).describe("Offset for pagination"),
    },
    async ({ query, agent, limit, offset }) => {
      const { messages } = getRepos();
      const results = messages.search(query, agent, limit, offset);
      return { content: [{ type: "text" as const, text: JSON.stringify({ query, count: results.length, offset, messages: results }) }] };
    }
  );

  server.tool(
    "msg_request",
    "Send a message and wait for a reply (synchronous request/reply pattern with polling).",
    {
      sender: z.string().max(256).regex(/^[a-zA-Z0-9_.-]+$/).describe("Sender agent name"),
      recipient: z.string().max(256).regex(/^[a-zA-Z0-9_.-]+$/).describe("Recipient agent name"),
      subject: z.string().min(1).max(1024).describe("Request subject"),
      body: z.string().min(1).max(65536).describe("Request body"),
      timeout_seconds: z.number().min(1).max(300).default(120).describe("Max wait time for reply"),
    },
    async ({ sender, recipient, subject, body, timeout_seconds }) => {
      const { messages, threads } = getRepos();

      const tid = threads.create(subject, [sender, recipient]);
      const msgId = messages.insert({
        sender, recipient, subject, body, priority: "high",
        thread_id: tid, expires_at: computeExpiresAt(),
      });

      // Check if reply already exists
      const existingReply = messages.findReplyInThread(tid, recipient, sender, msgId);
      if (existingReply) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, request_id: msgId, reply: existingReply }) }] };
      }

      // Wait for reply via event bus (no polling)
      try {
        await eventBus.waitFor(`message:${sender}`, timeout_seconds * 1000);
        // Event received — check for the actual reply
        const reply = messages.findReplyInThread(tid, recipient, sender, msgId);
        if (reply) {
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, request_id: msgId, reply }) }] };
        }
      } catch {
        // Timeout — fall through
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, request_id: msgId, error: "Timeout waiting for reply", timeout_seconds }) }] };
    }
  );

  server.tool(
    "msg_list_threads",
    "List conversation threads for an agent.",
    {
      agent: z.string().max(256).regex(/^[a-zA-Z0-9_.-]+$/).describe("Agent name"),
      limit: z.number().min(1).max(100).default(10).describe("Max threads"),
    },
    async ({ agent, limit }) => {
      const { threads } = getRepos();
      const result = threads.findByParticipant(agent, limit);
      return { content: [{ type: "text" as const, text: JSON.stringify({ agent, threads: result }) }] };
    }
  );

  server.tool(
    "msg_get",
    "Get a single message by ID. Returns full message details.",
    {
      message_id: z.string().max(256).describe("Message ID to retrieve"),
    },
    async ({ message_id }) => {
      const { messages } = getRepos();
      const msg = messages.findById(message_id);

      if (!msg) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Message not found" }) }] };
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({ message: msg }) }] };
    }
  );

  server.tool(
    "msg_delete",
    "Delete a message by ID. Only allows deletion of acked or delivered messages.",
    {
      message_id: z.string().max(256).describe("Message ID to delete"),
    },
    async ({ message_id }) => {
      const { messages } = getRepos();
      const msg = messages.findById(message_id);

      if (!msg) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Message not found" }) }] };
      }

      if (msg.status !== "acked" && msg.status !== "delivered") {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Cannot delete message with status '${msg.status}'. Only acked or delivered messages can be deleted.` }) }] };
      }

      messages.delete(message_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ deleted: true, message_id }) }] };
    }
  );

  server.tool(
    "msg_count",
    "Count messages by status for an agent.",
    {
      agent: z.string().max(256).regex(/^[a-zA-Z0-9_.-]+$/).describe("Agent name"),
    },
    async ({ agent }) => {
      const { messages } = getRepos();
      const counts = messages.countByStatus(agent);
      return { content: [{ type: "text" as const, text: JSON.stringify({ agent, counts }) }] };
    }
  );

  server.tool(
    "msg_update_status",
    "Manually update message status. Useful for admin operations.",
    {
      message_id: z.string().max(256).describe("Message ID to update"),
      status: z.enum(MESSAGE_STATUSES).describe("New status: pending, delivered, read, acked, expired"),
    },
    async ({ message_id, status }) => {
      const { messages } = getRepos();
      const msg = messages.findById(message_id);

      if (!msg) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Message not found" }) }] };
      }

      messages.updateStatus(message_id, status);
      return { content: [{ type: "text" as const, text: JSON.stringify({ updated: true, message_id, status }) }] };
    }
  );
}
