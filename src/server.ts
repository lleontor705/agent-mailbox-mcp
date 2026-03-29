import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMessagingTools } from "./tools/messaging.js";
import { registerRegistryTools } from "./tools/registry.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "agent-mailbox-mcp",
    version: "1.0.0",
  });

  registerMessagingTools(server);
  registerRegistryTools(server);

  return server;
}
