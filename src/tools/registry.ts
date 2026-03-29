import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../database/index.js";

export function registerRegistryTools(server: McpServer): void {
  server.tool(
    "agent_register",
    "Register an agent in the mailbox system with a name and role.",
    {
      name: z.string().min(1).describe("Agent name (unique identifier)"),
      role: z.string().default("").describe("Agent role (e.g. manager, coordinator, developer)"),
    },
    async ({ name, role }) => {
      const db = getDb();
      db.prepare(
        `INSERT INTO agent_registry (id, role) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET role = ?, last_active = datetime('now')`
      ).run(name, role, role);

      return { content: [{ type: "text" as const, text: JSON.stringify({ registered: true, agent: name, role }) }] };
    }
  );

  server.tool(
    "msg_list_agents",
    "List all registered agents with their roles and last activity.",
    {},
    async () => {
      const db = getDb();
      const agents = db.prepare(`SELECT * FROM agent_registry ORDER BY last_active DESC`).all();
      return { content: [{ type: "text" as const, text: JSON.stringify({ count: agents.length, agents }) }] };
    }
  );

  server.tool(
    "msg_activity_feed",
    "Get recent messaging activity feed.",
    {
      minutes: z.number().default(30).describe("Look back window in minutes"),
    },
    async ({ minutes }) => {
      const db = getDb();
      const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();

      const activity = db.prepare(
        `SELECT id, sender, recipient, subject, priority, status, created_at
         FROM messages WHERE created_at >= ? ORDER BY created_at DESC`
      ).all(cutoff);

      const stats = db.prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
           SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
           SUM(CASE WHEN status = 'acked' THEN 1 ELSE 0 END) as acked
         FROM messages WHERE created_at >= ?`
      ).get(cutoff);

      return { content: [{ type: "text" as const, text: JSON.stringify({ window_minutes: minutes, stats, activity }) }] };
    }
  );
}
