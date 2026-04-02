# Examples

## 1. Multi-Agent Code Review

Three agents collaborate on a code review:

```
┌─────────────┐    msg_send     ┌─────────────┐
│  Coordinator │──────────────>│  Reviewer A  │
│              │    msg_send     ├─────────────┤
│              │──────────────>│  Reviewer B  │
└──────┬───────┘               └──────┬───────┘
       │                              │
       │     msg_read_inbox           │
       │<─────────────────────────────│
       │     msg_acknowledge          │
       │     (with reply_body)        │
```

```
# Coordinator sends review requests
→ msg_send(sender: "coordinator", recipient: "reviewer-a", subject: "Review PR #42", body: "Please review the auth module changes", priority: "high")
→ msg_send(sender: "coordinator", recipient: "reviewer-b", subject: "Review PR #42", body: "Please review the database migration", priority: "high")

# Reviewer A reads and responds
→ msg_read_inbox(agent: "reviewer-a")
→ msg_acknowledge(message_id: "msg-...", reply_body: "LGTM, approved with minor suggestions: ...")

# Coordinator collects replies
→ msg_read_inbox(agent: "coordinator")
```

## 2. Research Pipeline with A2A Tasks

A coordinator delegates research tasks and waits for results:

```
→ agent_register(name: "coordinator", role: "manager")
→ agent_register(name: "web-researcher", role: "researcher", description: "Searches the web for information")
→ agent_register(name: "data-analyst", role: "analyst", description: "Analyzes structured data")

# Submit parallel research tasks
→ a2a_submit_task(from_agent: "coordinator", to_agent: "web-researcher", message: "Find market size data for AI agents in 2026")
→ a2a_submit_task(from_agent: "coordinator", to_agent: "data-analyst", message: "Analyze the attached sales data for Q1 trends")

# Workers pick up and complete
→ a2a_list_tasks(agent: "web-researcher", role: "to")
→ a2a_respond_task(task_id: "task-...", message: "Market size: $4.2B...", status: "completed", artifact_name: "market-research")

# Coordinator checks progress
→ a2a_list_tasks(agent: "coordinator", role: "from")
→ a2a_get_task(task_id: "task-...")
```

## 3. File Coordination Between Agents

Two agents need to edit the same configuration file:

```
# Agent A acquires exclusive lock
→ resource_acquire(resource_id: "config/settings.json", agent: "agent-a", lease_type: "exclusive", ttl_seconds: 60)
← { acquired: true }

# Agent B tries to acquire — blocked
→ resource_acquire(resource_id: "config/settings.json", agent: "agent-b", lease_type: "exclusive")
← { acquired: false, holder: { agent_id: "agent-a", expires_at: "..." } }

# Agent A finishes editing, releases
→ resource_release(resource_id: "config/settings.json", agent: "agent-a")

# Now Agent B can proceed
→ resource_acquire(resource_id: "config/settings.json", agent: "agent-b", lease_type: "exclusive", ttl_seconds: 60)
← { acquired: true }
```

## 4. Broadcasting Status Updates

Notify all agents about a system-wide event:

```
→ agent_register(name: "deployer", role: "ops")
→ agent_register(name: "monitor", role: "observability")
→ agent_register(name: "notifier", role: "alerts")

→ msg_broadcast(sender: "deployer", subject: "Deploy Started", body: "Deploying v2.0.0 to production. All agents should pause non-critical work.", priority: "high")
← { broadcast: true, recipients: 2 }
```

## 5. Dead-Letter Queue Recovery

Handle messages that expired without being read:

```
# Check for dead letters
→ dlq_list(limit: 10)
← { count: 3, entries: [{ id: "dlq-...", reason: "expired", subject: "Important task", ... }] }

# Retry a failed message
→ dlq_retry(dlq_id: "dlq-abc123")
← { retried: true, new_message_id: "msg-...", retry_count: 1 }

# Purge old entries
→ dlq_purge()
← { purged: true, removed: 2 }
```

## 6. HTTP API Integration

Use the HTTP transport for external systems:

```bash
# Start HTTP server
MAILBOX_TRANSPORT=http npx agent-mailbox-mcp

# Discover agents
curl http://localhost:4820/.well-known/agent-card.json

# Submit A2A task via JSON-RPC
curl -X POST http://localhost:4820/a2a \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tasks/send",
    "params": {
      "from_agent": "external-api",
      "to_agent": "processor",
      "message": { "role": "user", "parts": [{ "type": "text", "text": "Process order #12345" }] }
    }
  }'

# Stream task updates
curl -N http://localhost:4820/a2a/tasks/task-xyz/stream

# View dashboard
open http://localhost:4820/dashboard
```

## 7. Secure Setup with Authentication

```bash
# Generate a secret
export MAILBOX_AUTH_SECRET="my-super-secret-key-$(openssl rand -hex 16)"
export MAILBOX_ENCRYPTION_KEY="my-encryption-key-$(openssl rand -hex 16)"
export MAILBOX_TRANSPORT=http

npx agent-mailbox-mcp
```

HTTP requests now require a JWT bearer token. Stdio transport remains unauthenticated (trusted local process).
