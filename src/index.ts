#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { loadConfig } from "./config.js";
import { startHttpServer } from "./http.js";

async function main(): Promise<void> {
  const config = loadConfig();

  if (config.transport === "http") {
    await startHttpServer();
    return;
  }

  if (config.transport === "both") {
    // Start HTTP in parallel (non-blocking)
    startHttpServer().catch((err) => {
      console.error("HTTP server error:", err);
    });
  }

  // stdio transport (default, also used in "both" mode)
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
