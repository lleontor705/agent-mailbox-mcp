# Getting Started

## Why agent-mailbox-mcp?

In multi-agent AI systems, agents need to **communicate, coordinate, and share results**. Without a messaging layer, agents are isolated — they can't delegate tasks, wait for answers, or notify peers.

**agent-mailbox-mcp** solves this by providing:

- A **mailbox** for each agent (like email for AI)
- **Task delegation** via the A2A protocol (Google/Linux Foundation standard)
- **Resource coordination** so agents don't step on each other's work
- **Real-time streaming** to track task progress as it happens

## Installation

### Option 1: npx (no install needed)

```bash
npx -y agent-mailbox-mcp
```

### Option 2: Global install

```bash
npm install -g agent-mailbox-mcp
agent-mailbox-mcp
```

### Option 3: HTTP server with dashboard

```bash
MAILBOX_TRANSPORT=http npx -y agent-mailbox-mcp
# or
npx -y agent-mailbox-serve
```

Open `http://localhost:4820/dashboard` to see the web dashboard.

## Configure Your AI Client

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

### VS Code (MCP extension)

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "agent-mailbox": {
      "command": "npx",
      "args": ["-y", "agent-mailbox-mcp"]
    }
  }
}
```

## Your First Message

Once configured, your AI agent has access to 27 tools. Here's the simplest flow:

### 1. Register agents

```
→ agent_register(name: "coordinator", role: "manager")
→ agent_register(name: "researcher", role: "worker")
```

### 2. Send a message

```
→ msg_send(sender: "coordinator", recipient: "researcher", subject: "Research AI trends", body: "Please find the top 5 AI trends for 2026")
```

### 3. Read inbox

```
→ msg_read_inbox(agent: "researcher")
← { count: 1, messages: [{ subject: "Research AI trends", ... }] }
```

### 4. Acknowledge and reply

```
→ msg_acknowledge(message_id: "msg-abc123", reply_body: "Here are the top 5 trends: ...")
```

## Next Steps

- [Tools Reference](./tools-reference.md) — All 27 tools documented
- [A2A Protocol Guide](./a2a-guide.md) — Task delegation between agents
- [Examples](./examples.md) — Real-world usage patterns
