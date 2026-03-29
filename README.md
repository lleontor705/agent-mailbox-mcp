# agent-mailbox-mcp

MCP Server for **inter-agent messaging** — SQS-style mailbox for multi-agent AI systems.

Works with any MCP-compatible client: **Claude Code**, **Codex CLI**, **Gemini CLI**, **OpenClaw**, and more.

## Features

- **Direct Messaging** — Send messages between named agents with priority levels
- **Broadcast** — Send to all registered agents at once
- **Threading** — Conversation tracking with participant management
- **Deduplication** — Prevent duplicate processing via dedup keys
- **Acknowledge & Reply** — Confirm processing with optional reply
- **Search** — Find messages by content, sender, or recipient
- **Agent Registry** — Dynamic agent discovery with role metadata
- **Activity Feed** — Recent messaging timeline
- **Auto-expiration** — Messages expire after configurable TTL

## Quick Start

```bash
npx -y agent-mailbox-mcp
```

## Configuration

### Claude Code

```bash
claude mcp add agent-mailbox --transport stdio -- npx -y agent-mailbox-mcp
```

### Codex CLI (`~/.codex/config.toml`)

```toml
[mcp_servers.agent-mailbox]
command = "npx"
args = ["-y", "agent-mailbox-mcp"]
```

### Gemini CLI (`settings.json`)

```json
{
  "mcpServers": {
    "agent-mailbox": {
      "command": "npx",
      "args": ["-y", "agent-mailbox-mcp"]
    }
  }
}
```

### OpenClaw (`openclaw.json`)

```json5
mcp: {
  servers: {
    "agent-mailbox": { command: "npx", args: ["-y", "agent-mailbox-mcp"] }
  }
}
```

## Tools

### Messaging

| Tool | Description |
|------|-------------|
| `msg_send` | Send a message to another agent |
| `msg_read_inbox` | Read unread messages (marks as delivered) |
| `msg_acknowledge` | Acknowledge message, optionally reply |
| `msg_broadcast` | Send to all registered agents |
| `msg_search` | Search messages by content |
| `msg_threads` | List conversation threads |
| `msg_get` | Get a single message by ID |
| `msg_delete` | Delete an acked or delivered message |
| `msg_count` | Count messages by status for an agent |
| `msg_update_status` | Manually update message status |

### Agent Registry

| Tool | Description |
|------|-------------|
| `agent_register` | Register an agent with name and role |
| `agent_list` | List all registered agents |
| `agent_activity` | Recent messaging activity feed |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MAILBOX_DIR` | `~/.agent-mailbox` | Database directory |
| `MAILBOX_DB` | `~/.agent-mailbox/mailbox.db` | Full database path |
| `MAILBOX_TTL` | `86400` | Message TTL in seconds (default 24h) |

## Development

```bash
git clone https://github.com/lleontor705/agent-mailbox-mcp.git
cd agent-mailbox-mcp
npm install
npm run dev
npm test
npm run build
```

## License

MIT
