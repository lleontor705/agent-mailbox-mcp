# Agent Mailbox MCP — Skill Guide for AI Agents

> This document is designed for AI agents (Claude, GPT, Gemini, etc.) to understand how and when to use the agent-mailbox-mcp tools.

## When to Use This Skill

Use the mailbox when you need to:

- **Send information to another agent** that isn't in your current conversation
- **Delegate a task** to a specialized agent and wait for results
- **Coordinate work** on shared resources (files, APIs, databases)
- **Broadcast announcements** to all agents in the system
- **Track long-running work** across multiple agents

## Quick Decision Tree

```
Need to communicate with another agent?
├── Simple message → msg_send / msg_read_inbox / msg_acknowledge
├── Need a reply back → msg_request (waits for answer)
├── Tell everyone → msg_broadcast
├── Delegate complex work → a2a_submit_task / a2a_respond_task
├── Coordinate file access → resource_acquire / resource_release
└── Find other agents → msg_list_agents
```

## Tool Patterns

### Pattern 1: Fire and Forget

Send a message without waiting for a response.

```
msg_send(sender: "me", recipient: "logger", subject: "Event", body: "User completed onboarding")
```

### Pattern 2: Request and Wait

Send a message and block until the reply arrives.

```
msg_request(sender: "me", recipient: "calculator", subject: "Compute", body: "What is 42 * 17?", timeout_seconds: 30)
→ { success: true, reply: { body: "714" } }
```

### Pattern 3: Task Delegation (A2A)

For complex work that involves status tracking.

```
a2a_submit_task(from_agent: "me", to_agent: "researcher", message: "Find the latest pricing for AWS Lambda")
→ { task_id: "task-abc" }

# Later, check status
a2a_get_task(task_id: "task-abc")
→ { task: { status: "completed", artifacts: [...] } }
```

### Pattern 4: Resource Lock

Before editing a shared file:

```
resource_acquire(resource_id: "shared/config.yaml", agent: "me", ttl_seconds: 60)
# ... do your work ...
resource_release(resource_id: "shared/config.yaml", agent: "me")
```

## Agent Registration

Always register yourself when you start working:

```
agent_register(name: "my-agent-name", role: "my-role")
```

This makes you discoverable to other agents and enables broadcasts.

## Best Practices

1. **Register on startup** — Call `agent_register` at the beginning of your session
2. **Acknowledge messages** — Always call `msg_acknowledge` after processing a message
3. **Use dedup keys** — If retrying operations, set `dedup_key` to prevent duplicates
4. **Set appropriate priorities** — Use `high` only for urgent messages
5. **Release resources** — Always release locks when done, even on failure
6. **Check the DLQ** — Periodically check `dlq_list` for failed messages
7. **Use tasks for complex work** — Use A2A tasks instead of messages when you need status tracking
