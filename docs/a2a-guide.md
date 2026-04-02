# A2A Protocol Guide

## What is A2A?

**Agent2Agent (A2A)** is an open protocol by Google (now under the Linux Foundation) that enables AI agents to discover each other and delegate tasks — regardless of vendor or framework.

While **MCP** connects an agent to tools and data (vertical), **A2A** connects agents to each other (horizontal):

```
Agent A ──(MCP)──> Database, APIs, Files
   │
   └──(A2A)──> Agent B ──(MCP)──> Different tools
                  │
                  └──(A2A)──> Agent C
```

## Agent Cards (Discovery)

Every A2A-compatible agent publishes an **Agent Card** — a JSON document describing its capabilities.

### Server Agent Card

```
GET http://localhost:4820/.well-known/agent-card.json
```

```json
{
  "name": "agent-mailbox-mcp",
  "description": "MCP Server for inter-agent messaging with A2A protocol support...",
  "url": "http://localhost:4820/a2a",
  "version": "1.0.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": true,
    "stateTransitionHistory": true
  },
  "skills": [
    { "id": "messaging", "name": "Agent Messaging", ... },
    { "id": "task-management", "name": "A2A Task Management", ... },
    { "id": "agent-registry", "name": "Agent Discovery", ... }
  ]
}
```

### Per-Agent Cards

When agents register with `description` and `skills`, they get their own card:

```
GET http://localhost:4820/agents/researcher/agent-card.json
```

## Task Lifecycle

A2A tasks follow a state machine:

```
submitted → working → completed
                   → failed
                   → input-required → working → ...
         → canceled (from any non-terminal state)
```

### Example: Research Task

**Agent A (coordinator) submits a task:**

```
→ a2a_submit_task(
    from_agent: "coordinator",
    to_agent: "researcher",
    message: "Find the top 5 competitors for our product"
  )
← { submitted: true, task_id: "task-a1b2c3", status: "submitted" }
```

**Agent B (researcher) picks it up:**

```
→ a2a_get_task(task_id: "task-a1b2c3")
← { task: { status: "submitted", messages: [...] } }

→ a2a_respond_task(
    task_id: "task-a1b2c3",
    message: "Working on it, analyzing market data...",
    status: "working"
  )
```

**Agent B needs more info:**

```
→ a2a_respond_task(
    task_id: "task-a1b2c3",
    message: "Which market segment? B2B or B2C?",
    status: "input-required"
  )
```

**Agent A provides input:**

```
→ a2a_respond_task(
    task_id: "task-a1b2c3",
    message: "B2B enterprise segment",
    status: "working"
  )
```

**Agent B completes the task:**

```
→ a2a_respond_task(
    task_id: "task-a1b2c3",
    message: "Analysis complete. Top 5 competitors: ...",
    status: "completed",
    artifact_name: "competitor-analysis"
  )
```

## JSON-RPC API (HTTP)

For external agents or services, the A2A endpoint accepts JSON-RPC 2.0:

```bash
curl -X POST http://localhost:4820/a2a \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tasks/send",
    "params": {
      "from_agent": "external-bot",
      "to_agent": "researcher",
      "message": {
        "role": "user",
        "parts": [{ "type": "text", "text": "Analyze this dataset" }]
      }
    }
  }'
```

### Available Methods

| Method | Description |
|--------|-------------|
| `tasks/send` | Create a new task |
| `tasks/get` | Get task with history |
| `tasks/cancel` | Cancel a task |
| `tasks/respond` | Respond to a task |
| `tasks/list` | List tasks for an agent |
| `tasks/sendSubscribe` | Create task + get SSE stream URL |
| `tasks/resubscribe` | Resubscribe to task SSE stream |
| `tasks/pushNotification/set` | Set webhook for task updates |
| `tasks/pushNotification/get` | Get webhook subscription |

## SSE Streaming

Subscribe to real-time task updates:

```bash
curl -N http://localhost:4820/a2a/tasks/task-a1b2c3/stream
```

Events:

```
event: connected
data: {"task_id":"task-a1b2c3"}

event: task-status
data: {"task_id":"task-a1b2c3","status":"working","timestamp":"..."}

event: task-status
data: {"task_id":"task-a1b2c3","status":"completed","timestamp":"...","task":{...}}
```

## Push Notifications

For agents that can't hold SSE connections open:

```bash
curl -X POST http://localhost:4820/a2a \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tasks/pushNotification/set",
    "params": {
      "task_id": "task-a1b2c3",
      "webhook_url": "https://my-agent.example.com/webhook"
    }
  }'
```

The mailbox will POST task status events to your webhook with exponential backoff retry (3 attempts).
