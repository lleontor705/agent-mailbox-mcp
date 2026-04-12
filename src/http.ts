import { randomUUID } from "node:crypto";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { loadConfig } from "./config.js";
import { authMiddleware } from "./auth/middleware.js";
import { createAgentCardRouter } from "./a2a/agent-card.js";
import { createA2ARouter } from "./a2a/router.js";
import { createDashboardRouter } from "./dashboard/index.js";

export async function startHttpServer(): Promise<void> {
  const config = loadConfig();
  const app = express();
  app.use(express.json());

  // Agent Card discovery (public, no auth)
  app.use(createAgentCardRouter());

  // A2A JSON-RPC endpoint (auth protected)
  app.use("/a2a", authMiddleware, createA2ARouter());

  // Dashboard (public, no auth)
  app.use("/dashboard", createDashboardRouter());

  // Auth middleware for MCP endpoints (skipped if no MAILBOX_AUTH_SECRET)
  app.use("/mcp", authMiddleware);

  // Map of session ID → transport for stateful connections
  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      // Existing session
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // New session — create transport and server
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        transports.delete(transport.sessionId);
      }
    };

    const server = createServer();
    await server.connect(transport);

    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
    }

    await transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", transport: "http", sessions: transports.size });
  });

  app.listen(config.port, () => {
    console.error(`Agent Mailbox MCP HTTP server listening on port ${config.port}`);
  });
}
