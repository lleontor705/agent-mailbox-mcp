import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TaskManager } from "../a2a/task-manager.js";
import { TASK_STATES } from "../types/a2a.js";

const taskManager = new TaskManager();

const partSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("file"),
    file: z.object({
      name: z.string().optional(),
      mimeType: z.string().optional(),
      bytes: z.string().optional(),
      uri: z.string().optional(),
    }),
  }),
  z.object({ type: z.literal("data"), data: z.record(z.unknown()) }),
]);

export function registerA2ATools(server: McpServer): void {
  server.tool(
    "a2a_submit_task",
    "Submit a task to another agent via the A2A protocol. Creates a new task with an initial message.",
    {
      from_agent: z.string().min(1).max(256).regex(/^[a-zA-Z0-9_.-]+$/).describe("Sender agent name"),
      to_agent: z.string().min(1).max(256).regex(/^[a-zA-Z0-9_.-]+$/).describe("Target agent name"),
      message: z.string().min(1).max(65536).describe("Task message (text content)"),
      session_id: z.string().max(256).optional().describe("Optional session ID for grouping related tasks"),
      metadata: z.record(z.string()).optional().describe("Optional metadata key-value pairs"),
    },
    async ({ from_agent, to_agent, message, session_id, metadata }) => {
      const result = taskManager.submit({
        from_agent,
        to_agent,
        message: { role: "user", parts: [{ type: "text", text: message }] },
        session_id,
        metadata,
      });

      if (!result.success) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: result.error }) }] };
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({
        submitted: true,
        task_id: result.task!.id,
        status: result.task!.status,
        to_agent,
      }) }] };
    }
  );

  server.tool(
    "a2a_get_task",
    "Get the status and full history of an A2A task including messages and artifacts.",
    {
      task_id: z.string().min(1).max(256).describe("Task ID to retrieve"),
    },
    async ({ task_id }) => {
      const result = taskManager.getTask(task_id);

      if (!result.success) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: result.error }) }] };
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({ task: result.task }) }] };
    }
  );

  server.tool(
    "a2a_cancel_task",
    "Cancel an A2A task. Only non-terminal tasks can be canceled.",
    {
      task_id: z.string().min(1).max(256).describe("Task ID to cancel"),
    },
    async ({ task_id }) => {
      const result = taskManager.cancel(task_id);

      if (!result.success) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: result.error }) }] };
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({
        canceled: true,
        task_id,
        status: result.task!.status,
      }) }] };
    }
  );

  server.tool(
    "a2a_list_tasks",
    "List A2A tasks for an agent with pagination.",
    {
      agent: z.string().min(1).max(256).regex(/^[a-zA-Z0-9_.-]+$/).describe("Agent name"),
      role: z.enum(["from", "to"]).default("to").describe("List tasks sent by (from) or to this agent"),
      limit: z.number().min(1).max(100).default(20).describe("Max tasks to return"),
      offset: z.number().min(0).default(0).describe("Offset for pagination"),
    },
    async ({ agent, role, limit, offset }) => {
      const tasks = taskManager.listTasks(agent, role, limit, offset);

      return { content: [{ type: "text" as const, text: JSON.stringify({
        agent,
        role,
        count: tasks.length,
        tasks,
      }) }] };
    }
  );

  server.tool(
    "a2a_respond_task",
    "Respond to an A2A task as the assigned agent. Sends a response and optionally updates the task status.",
    {
      task_id: z.string().min(1).max(256).describe("Task ID to respond to"),
      message: z.string().min(1).max(65536).describe("Response message (text content)"),
      status: z.enum(["completed", "failed", "working", "input-required"]).default("completed").describe("New task status after response"),
      artifact_name: z.string().max(256).optional().describe("Name for the response artifact"),
      artifact_description: z.string().max(1024).optional().describe("Description of the response artifact"),
    },
    async ({ task_id, message, status, artifact_name, artifact_description }) => {
      const result = taskManager.respond(
        task_id,
        [{ type: "text", text: message }],
        status,
        artifact_name,
        artifact_description
      );

      if (!result.success) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: result.error }) }] };
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({
        responded: true,
        task_id,
        status: result.task!.status,
        messages_count: result.task!.messages?.length || 0,
        artifacts_count: result.task!.artifacts?.length || 0,
      }) }] };
    }
  );
}
