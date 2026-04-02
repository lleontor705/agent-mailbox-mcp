import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMessagingTools } from "./tools/messaging.js";
import { registerRegistryTools } from "./tools/registry.js";
import { registerA2ATools } from "./tools/a2a.js";
import { registerResourceTools } from "./tools/resources.js";
import { registerDeadLetterTools } from "./tools/dead-letter.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "agent-mailbox-mcp",
    version: "1.0.0",
  });

  registerMessagingTools(server);
  registerRegistryTools(server);
  registerA2ATools(server);
  registerResourceTools(server);
  registerDeadLetterTools(server);

  return server;
}
