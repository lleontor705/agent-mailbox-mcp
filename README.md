# agent-mailbox-mcp

MCP Server for **inter-agent messaging** — SQS-style mailbox for multi-agent AI systems.

Works with any MCP-compatible client: **Claude Code**, **Codex CLI**, **Gemini CLI**, **OpenClaw**, and more.

[![npm version](https://img.shields.io/npm/v/agent-mailbox-mcp)](https://www.npmjs.com/package/agent-mailbox-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

## Features

- **Direct Messaging** — Send messages between named agents with priority levels (high, normal, low)
- **Broadcast** — Send to all registered agents at once
- **Threading** — Conversation tracking with automatic participant management
- **Deduplication** — Prevent duplicate processing via dedup keys
- **Acknowledge & Reply** — Confirm processing with optional reply in the same thread
- **Request/Reply** — Synchronous request pattern with configurable polling timeout
- **Search** — Find messages by content, sender, or recipient
- **Agent Registry** — Dynamic agent discovery with role metadata
- **Activity Feed** — Recent messaging timeline with statistics
- **Auto-expiration** — Messages expire after configurable TTL (default 24h)

## Quick Start

```bash
npx -y agent-mailbox-mcp
```

No configuration needed — the server creates a SQLite database at `~/.agent-mailbox/mailbox.db` automatically.

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

### Messaging (11 tools)

| Tool | Description |
|------|-------------|
| `msg_send` | Send a message to another agent with optional threading, deduplication, and priority |
| `msg_read_inbox` | Read unread messages for an agent (marks as delivered, sorted by priority) |
| `msg_acknowledge` | Acknowledge a message as processed, optionally send a reply |
| `msg_broadcast` | Send a message to all registered agents at once |
| `msg_search` | Search messages by content, subject, or sender/recipient |
| `msg_request` | Send a message and poll for a reply (synchronous request/reply pattern) |
| `msg_list_threads` | List conversation threads with unread counts |
| `msg_get` | Get a single message by ID |
| `msg_delete` | Delete an acked or delivered message |
| `msg_count` | Count messages by status for an agent |
| `msg_update_status` | Manually update message status (admin operations) |

### Agent Registry (3 tools)

| Tool | Description |
|------|-------------|
| `agent_register` | Register an agent with name and role (upsert) |
| `msg_list_agents` | List all registered agents with roles and last activity |
| `msg_activity_feed` | Recent messaging activity feed with statistics |

## Tool Reference

### msg_send

Send a message to another agent. Supports deduplication and threading.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sender` | string | Yes | Sender agent name (alphanumeric, `_`, `.`, `-`) |
| `recipient` | string | Yes | Recipient agent name |
| `subject` | string | Yes | Message subject (max 1024 chars) |
| `body` | string | Yes | Message body (max 64KB) |
| `priority` | string | No | `high`, `normal` (default), or `low` |
| `thread_id` | string | No | Thread ID for conversation continuity |
| `dedup_key` | string | No | Deduplication key to prevent duplicate processing |

### msg_read_inbox

Read unread messages for an agent. Messages are marked as delivered. Returns messages sorted by priority (high > normal > low), then by creation time.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent` | string | Yes | Agent name (recipient) |
| `limit` | number | No | Max messages to return (1-100, default 10) |

### msg_acknowledge

Acknowledge a message as processed. Optionally send a reply back to the sender in the same thread.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `message_id` | string | Yes | Message ID to acknowledge |
| `reply_body` | string | No | Optional reply message body |

### msg_broadcast

Send a message to all registered agents (excluding sender).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sender` | string | Yes | Sender agent name |
| `subject` | string | Yes | Message subject |
| `body` | string | Yes | Message body |
| `priority` | string | No | `high`, `normal` (default), or `low` |

### msg_search

Search messages by content, subject, or sender/recipient using LIKE matching.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query |
| `agent` | string | No | Filter by agent (sender or recipient) |
| `limit` | number | No | Max results (1-100, default 20) |

### msg_request

Send a message and wait for a reply. Uses exponential backoff polling (500ms to 5s intervals).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sender` | string | Yes | Sender agent name |
| `recipient` | string | Yes | Recipient agent name |
| `subject` | string | Yes | Request subject |
| `body` | string | Yes | Request body |
| `timeout_seconds` | number | No | Max wait time (1-300, default 120) |

### msg_list_threads

List conversation threads for an agent with unread message counts.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent` | string | Yes | Agent name |
| `limit` | number | No | Max threads (1-100, default 10) |

### msg_get

Get a single message by ID. Returns full message details.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `message_id` | string | Yes | Message ID to retrieve |

### msg_delete

Delete a message by ID. Only allows deletion of messages with `acked` or `delivered` status.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `message_id` | string | Yes | Message ID to delete |

### msg_count

Count messages grouped by status for an agent.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent` | string | Yes | Agent name |

### msg_update_status

Manually update message status. Useful for admin operations.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `message_id` | string | Yes | Message ID to update |
| `status` | string | Yes | New status: `pending`, `delivered`, `read`, `acked`, `expired` |

### agent_register

Register an agent in the mailbox system. Uses upsert — re-registering updates the role and last active timestamp.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Agent name (unique identifier, alphanumeric, `_`, `.`, `-`) |
| `role` | string | No | Agent role (e.g. manager, coordinator, developer) |

### msg_list_agents

List all registered agents with their roles and last activity. No parameters required.

### msg_activity_feed

Get recent messaging activity feed with aggregate statistics.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `minutes` | number | No | Lookback window in minutes (default 30) |

## Message Lifecycle

```
pending → delivered → read → acked
                              ↓
                           expired (auto, after TTL)
```

- **pending** — Message sent, not yet read by recipient
- **delivered** — Recipient read their inbox (`msg_read_inbox`)
- **read** — Recipient explicitly marked as read
- **acked** — Recipient acknowledged processing (`msg_acknowledge`)
- **expired** — TTL exceeded, cleaned up on next inbox read

## Architecture

- **Transport**: stdio (Model Context Protocol)
- **Storage**: SQLite via `better-sqlite3` with WAL mode
- **Schema**: 3 tables — `messages`, `threads`, `agent_registry`
- **IDs**: Prefixed UUIDs (`msg-`, `thr-`)
- **Validation**: Zod schemas for all tool inputs
- **Concurrency**: WAL mode + 5s busy timeout for multi-process safety

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
npm run dev          # Run with tsx (development)
npm test             # Run tests
npm run build        # Compile TypeScript
npm run lint         # Type check
npm run inspect      # MCP Inspector for debugging
```

## License

MIT
