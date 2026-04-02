# Tools Reference

## Messaging Tools (12)

### msg_send

Send a message to another agent with priority, threading, and deduplication.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sender` | string | yes | Sender agent name |
| `recipient` | string | yes | Recipient agent name |
| `subject` | string | yes | Message subject (max 1024) |
| `body` | string | yes | Message body (max 65536) |
| `priority` | enum | no | `high`, `normal` (default), `low` |
| `thread_id` | string | no | Existing thread ID for conversation continuity |
| `dedup_key` | string | no | Prevents duplicate processing |

**Returns:** `{ sent: true, message_id, thread_id, recipient, priority }`

---

### msg_read_inbox

Read unread messages for an agent. Messages are automatically marked as delivered.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent` | string | yes | Agent name (recipient) |
| `limit` | number | no | Max messages (default 10, max 100) |

**Returns:** `{ agent, count, messages: [...] }`

Messages are returned sorted by priority (high → normal → low), then by creation time.

---

### msg_acknowledge

Acknowledge a message as processed. Optionally send a reply back.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `message_id` | string | yes | Message ID to acknowledge |
| `reply_body` | string | no | Optional reply message body |

**Returns:** `{ acknowledged: true, message_id, reply_id }`

---

### msg_broadcast

Send a message to all registered agents (except sender).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sender` | string | yes | Sender agent name |
| `subject` | string | yes | Message subject |
| `body` | string | yes | Message body |
| `priority` | enum | no | `high`, `normal` (default), `low` |

**Returns:** `{ broadcast: true, recipients, message_ids, thread_id }`

---

### msg_search

Search messages by content, subject, or sender/recipient.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Search query (searches subject + body) |
| `agent` | string | no | Filter by agent (sender or recipient) |
| `limit` | number | no | Max results (default 20) |
| `offset` | number | no | Pagination offset (default 0) |

---

### msg_request

Send a message and wait for a reply (synchronous request/reply pattern).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sender` | string | yes | Sender agent name |
| `recipient` | string | yes | Recipient agent name |
| `subject` | string | yes | Request subject |
| `body` | string | yes | Request body |
| `timeout_seconds` | number | no | Max wait time (default 120, max 300) |

Uses an internal event bus (no polling). Returns when reply arrives or timeout.

---

### msg_list_threads

List conversation threads for an agent with unread counts.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent` | string | yes | Agent name |
| `limit` | number | no | Max threads (default 10) |

---

### msg_get / msg_delete / msg_count / msg_update_status

Standard CRUD operations for messages. `msg_delete` only works on acked or delivered messages.

---

## Registry Tools (3)

### agent_register

Register an agent with metadata and optional A2A Agent Card fields.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | Unique agent identifier |
| `role` | string | no | Agent role (e.g. "manager", "worker") |
| `description` | string | no | Agent description (for Agent Card) |
| `skills` | array | no | Agent skills for A2A discovery |
| `url` | string | no | Agent endpoint URL |
| `version` | string | no | Agent version |

### msg_list_agents / msg_activity_feed

Discovery and monitoring tools.

---

## A2A Tools (5)

### a2a_submit_task

Submit a task to another agent via the A2A protocol.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `from_agent` | string | yes | Requesting agent |
| `to_agent` | string | yes | Target agent (must be registered) |
| `message` | string | yes | Task description |
| `session_id` | string | no | Group related tasks |
| `metadata` | object | no | Key-value metadata |

**Returns:** `{ submitted: true, task_id, status: "submitted", to_agent }`

---

### a2a_get_task

Get task status with full message and artifact history.

---

### a2a_respond_task

Respond to a task as the assigned agent.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_id` | string | yes | Task ID |
| `message` | string | yes | Response message |
| `status` | enum | no | `completed` (default), `failed`, `working`, `input-required` |
| `artifact_name` | string | no | Name for the result artifact |

---

### a2a_cancel_task / a2a_list_tasks

Task management and listing with pagination.

---

## Resource Tools (4)

### resource_acquire

Acquire an advisory lease on a resource (file, URL, key).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resource_id` | string | yes | Resource identifier |
| `agent` | string | yes | Agent acquiring the lease |
| `lease_type` | enum | no | `exclusive` (default) or `shared` |
| `ttl_seconds` | number | no | Duration (default 300, max 86400) |

Returns `{ acquired: false, holder: {...} }` if already held exclusively.

---

### resource_release / resource_check / resource_list

Lease management tools.

---

## Dead-Letter Queue Tools (3)

### dlq_list

List messages that expired or failed delivery.

### dlq_retry

Re-insert a dead-letter message as a new pending message.

### dlq_purge

Remove all entries from the dead-letter queue.
