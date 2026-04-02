# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run build        # TypeScript compilation to build/
npm run dev          # Run stdio server with tsx (no build step needed)
npm run serve        # Run HTTP server with tsx (dashboard at /dashboard)
npm run lint         # Type-check only (tsc --noEmit)
npm test             # Run all tests once (vitest run)
npm run test:watch   # Watch mode tests
npm run inspect      # Launch MCP inspector for debugging tools
```

Tests use vitest with globals enabled (no need to import describe/it/expect). Test files live in `tests/` and use in-memory SQLite (`:memory:`). Use `initFromDb(db)` to set up schema + migrations on a test database.

## Architecture

MCP server for inter-agent messaging with A2A protocol support, dual transport (stdio + HTTP), and a web dashboard.

**Transport modes** (set via `MAILBOX_TRANSPORT`):
- `stdio` (default) — CLI entry (`src/index.ts`) → `StdioServerTransport`
- `http` — Express entry (`src/http.ts`) → `StreamableHTTPServerTransport` on `/mcp`
- `both` — runs both transports simultaneously

**HTTP endpoints:**
- `/mcp` — MCP over HTTP (Streamable HTTP transport with sessions)
- `/a2a` — A2A JSON-RPC 2.0 endpoint (tasks/send, tasks/get, tasks/cancel, tasks/respond, tasks/list, push notifications)
- `/a2a/tasks/:id/stream` — SSE streaming for task updates
- `/.well-known/agent-card.json` — Server Agent Card (A2A discovery)
- `/agents/:id/agent-card.json` — Per-agent Agent Card
- `/dashboard` — Web dashboard with real-time stats
- `/health` — Health check

**Request flow:** Entry point → transport → `createServer()` (`src/server.ts`) → tool handlers → repositories → SQLite

**Tool modules (27 MCP tools):**
- `src/tools/messaging.ts` — 12 tools prefixed `msg_*` (send, read inbox, acknowledge, broadcast, search, request/reply, threads, get, delete, count, status update)
- `src/tools/registry.ts` — 3 tools (`agent_register` with A2A Agent Card fields, `msg_list_agents`, `msg_activity_feed`)
- `src/tools/a2a.ts` — 5 tools prefixed `a2a_*` (submit_task, get_task, cancel_task, list_tasks, respond_task)
- `src/tools/resources.ts` — 4 tools prefixed `resource_*` (acquire, release, check, list) for advisory file/resource leasing
- `src/tools/dead-letter.ts` — 3 tools prefixed `dlq_*` (list, retry, purge) for dead-letter queue management

**A2A Protocol** (`src/a2a/`):
- `task-manager.ts` — Task lifecycle with state machine (submitted → working → input-required → completed/failed/canceled)
- `router.ts` — JSON-RPC 2.0 dispatch with Zod validation
- `agent-card.ts` — Agent Card generation for server and individual agents
- `streaming.ts` — SSE streaming via `TaskStreamManager`
- `push-notifications.ts` — Webhook notifications with exponential backoff retry

**Repository layer** (`src/database/repositories/`):
- `MessageRepository` — message CRUD, search, counts, expiration → DLQ, encryption at rest
- `ThreadRepository` — thread lifecycle, participant management via junction table
- `AgentRepository` — agent registration with Agent Card fields, activity tracking
- `TaskRepository` — A2A task CRUD, messages, artifacts
- `LeaseRepository` — advisory resource leasing with auto-expiration
- `DeadLetterRepository` — dead-letter queue for expired/failed messages
- Access via `getRepos()` from `src/database/index.ts`; tools never use raw SQL

**Database** (`src/database/index.ts`):
- Singleton lazy-initialized SQLite via `getDb()`, repositories via `getRepos()`
- WAL mode with tuned pragmas (32MB cache, 5s busy timeout, foreign keys on)
- 6 migrations in `src/database/migrations.ts` — sequential runner with version tracking
- Tables: `agent_registry`, `threads`, `messages`, `thread_participants`, `a2a_tasks`, `a2a_task_messages`, `a2a_task_artifacts`, `a2a_push_subscriptions`, `resource_leases`, `dead_letter_queue`, `schema_version`

**Event system** (`src/events/event-bus.ts`):
- In-process EventBus singleton with publish/subscribe/waitFor
- Used by `msg_send` to notify listeners and by `msg_request` to avoid polling

**Encryption** (`src/crypto/encryption.ts`):
- AES-256-GCM via Node.js `crypto` (no external deps)
- Enabled by setting `MAILBOX_ENCRYPTION_KEY`; pass-through when not set
- Applied transparently in MessageRepository (encrypt on insert, decrypt on read)

**Auth** (`src/auth/`):
- JWT bearer tokens using HMAC-SHA256 (Node.js `crypto`, no external deps)
- Only enforced on HTTP transport; stdio remains unauthenticated
- Scopes: `messages:read/write/admin`, `agents:read/write`, `a2a:submit`

**Dashboard** (`src/dashboard/`):
- Self-contained HTML SPA (no build toolchain) at `/dashboard`
- REST API at `/dashboard/api` (agents, messages, tasks, stats, leases, dlq)
- Auto-refresh every 10 seconds

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MAILBOX_DIR` | `~/.agent-mailbox` | Database directory |
| `MAILBOX_DB` | `~/.agent-mailbox/mailbox.db` | Full database path |
| `MAILBOX_TTL` | `86400` (24h) | Message TTL in seconds |
| `MAILBOX_PORT` | `4820` | HTTP server port |
| `MAILBOX_TRANSPORT` | `stdio` | Transport mode: `stdio`, `http`, or `both` |
| `MAILBOX_AUTH_SECRET` | (empty) | JWT signing secret; empty = auth disabled |
| `MAILBOX_ENCRYPTION_KEY` | (empty) | AES-256-GCM key; empty = no encryption |

## CI

Matrix CI runs on Ubuntu/Windows/macOS with Node 18, 20, 22. Release pipeline requires production environment approval before npm publish with provenance.
