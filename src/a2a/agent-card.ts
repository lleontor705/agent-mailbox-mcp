import { Router } from "express";
import { getRepos } from "../database/index.js";
import { loadConfig } from "../config.js";
import type { AgentCard, AgentSkill } from "../types/a2a.js";

/**
 * Generates the server's own Agent Card describing the mailbox service.
 */
export function getServerAgentCard(): AgentCard {
  const config = loadConfig();
  const baseUrl = `http://localhost:${config.port}`;

  return {
    name: "agent-mailbox-mcp",
    description:
      "MCP Server for inter-agent messaging with A2A protocol support. Provides mailbox-style messaging, threading, broadcasting, and task management for multi-agent AI systems.",
    url: `${baseUrl}/a2a`,
    version: "1.0.0",
    capabilities: {
      streaming: true,
      pushNotifications: true,
      stateTransitionHistory: true,
    },
    skills: [
      {
        id: "messaging",
        name: "Agent Messaging",
        description:
          "Send, receive, search, and manage messages between agents with priority, threading, and deduplication.",
        tags: ["messaging", "mailbox", "mcp"],
      },
      {
        id: "task-management",
        name: "A2A Task Management",
        description:
          "Submit, track, and manage tasks between agents following the A2A protocol lifecycle.",
        tags: ["a2a", "tasks", "coordination"],
      },
      {
        id: "agent-registry",
        name: "Agent Discovery",
        description:
          "Register agents, discover peers, and monitor activity across the system.",
        tags: ["registry", "discovery"],
      },
    ],
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    authentication: {
      schemes: config.authSecret ? ["bearer"] : [],
    },
  };
}

/**
 * Generates an Agent Card for a specific registered agent.
 */
export function getAgentCard(agentId: string): AgentCard | null {
  const { agents } = getRepos();
  const agent = agents.findById(agentId);
  if (!agent) return null;

  const config = loadConfig();
  const baseUrl = `http://localhost:${config.port}`;

  // Parse skills from the agent's skills JSON column
  let skills: AgentSkill[] = [];
  try {
    const raw = (agent as any).skills;
    if (raw) skills = JSON.parse(raw);
  } catch {
    // ignore malformed
  }

  return {
    name: agentId,
    description: (agent as any).description || `Agent ${agentId} (${agent.role || "unspecified role"})`,
    url: `${baseUrl}/a2a`,
    version: (agent as any).version || "1.0.0",
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    skills,
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    authentication: {
      schemes: config.authSecret ? ["bearer"] : [],
    },
  };
}

/**
 * Creates Express router for Agent Card endpoints.
 */
export function createAgentCardRouter(): Router {
  const router = Router();

  // Server-level agent card (A2A discovery endpoint)
  router.get("/.well-known/agent-card.json", (_req, res) => {
    res.json(getServerAgentCard());
  });

  // Per-agent agent card
  router.get("/agents/:agentId/agent-card.json", (req, res) => {
    const card = getAgentCard(req.params.agentId);
    if (!card) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json(card);
  });

  return router;
}
