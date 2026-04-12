import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getRepos } from "../database/index.js";

export function registerRegistryTools(server: McpServer): void {
  server.tool(
    "agent_register",
    "Register an agent in the mailbox system with a name, role, and optional A2A Agent Card metadata.",
    {
      name: z.string().min(1).max(256).regex(/^[a-zA-Z0-9_.-]+$/).describe("Agent name (unique identifier)"),
      role: z.string().max(256).default("").describe("Agent role (e.g. manager, coordinator, developer)"),
      description: z.string().max(1024).optional().describe("Agent description for A2A Agent Card"),
      url: z.string().max(512).optional().describe("Agent endpoint URL"),
      skills: z.array(z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        tags: z.array(z.string()).optional(),
      })).optional().describe("Agent skills for A2A discovery"),
      version: z.string().max(32).optional().describe("Agent version"),
    },
    async ({ name, role, description, url, skills, version }) => {
      const { agents } = getRepos();
      agents.register({
        name, role,
        description,
        url,
        skills: skills ? JSON.stringify(skills) : undefined,
        version,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify({ registered: true, agent: name, role, description, version }) }] };
    }
  );

  server.tool(
    "msg_list_agents",
    "List all registered agents with their roles and last activity.",
    {},
    async () => {
      const { agents } = getRepos();
      const list = agents.listAll();
      return { content: [{ type: "text" as const, text: JSON.stringify({ count: list.length, agents: list }) }] };
    }
  );

  server.tool(
    "msg_activity_feed",
    "Get recent messaging activity feed.",
    {
      minutes: z.number().default(30).describe("Look back window in minutes"),
    },
    async ({ minutes }) => {
      const { messages } = getRepos();
      const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
      const activity = messages.findActivitySince(cutoff);
      const stats = messages.getActivityStats(cutoff);

      return { content: [{ type: "text" as const, text: JSON.stringify({ window_minutes: minutes, stats, activity }) }] };
    }
  );
}
