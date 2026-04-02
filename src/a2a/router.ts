import { Router } from "express";
import { z } from "zod";
import { TaskManager } from "./task-manager.js";
import { taskStreamManager } from "./streaming.js";
import { pushNotificationService } from "./push-notifications.js";
import type { JsonRpcRequest, JsonRpcResponse, Part } from "../types/a2a.js";
import { JSON_RPC_ERRORS, TASK_STATES } from "../types/a2a.js";

const taskManager = new TaskManager();

// --- Zod schemas for A2A params ---

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

const messageSchema = z.object({
  role: z.enum(["user", "agent"]),
  parts: z.array(partSchema).min(1),
});

const tasksSendSchema = z.object({
  from_agent: z.string().min(1),
  to_agent: z.string().min(1),
  message: messageSchema,
  session_id: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const tasksGetSchema = z.object({
  id: z.string().min(1),
});

const tasksCancelSchema = z.object({
  id: z.string().min(1),
});

const tasksRespondSchema = z.object({
  id: z.string().min(1),
  parts: z.array(partSchema).min(1),
  status: z.enum(["completed", "failed", "working", "input-required"]).default("completed"),
  artifact_name: z.string().optional(),
  artifact_description: z.string().optional(),
});

const tasksListSchema = z.object({
  agent: z.string().min(1),
  role: z.enum(["from", "to"]).default("to"),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

// --- Helper to build JSON-RPC responses ---

function rpcSuccess(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

// --- Method handlers ---

type MethodHandler = (
  params: Record<string, unknown> | undefined,
  id: string | number
) => JsonRpcResponse;

const methods: Record<string, MethodHandler> = {
  "tasks/send"(params, id) {
    const parsed = tasksSendSchema.safeParse(params);
    if (!parsed.success) {
      return rpcError(id, JSON_RPC_ERRORS.INVALID_PARAMS, "Invalid params", parsed.error.issues);
    }

    const result = taskManager.submit(parsed.data);
    if (!result.success) {
      return rpcError(id, JSON_RPC_ERRORS.AGENT_NOT_FOUND, result.error!);
    }
    return rpcSuccess(id, result.task);
  },

  "tasks/get"(params, id) {
    const parsed = tasksGetSchema.safeParse(params);
    if (!parsed.success) {
      return rpcError(id, JSON_RPC_ERRORS.INVALID_PARAMS, "Invalid params", parsed.error.issues);
    }

    const result = taskManager.getTask(parsed.data.id);
    if (!result.success) {
      return rpcError(id, JSON_RPC_ERRORS.TASK_NOT_FOUND, result.error!);
    }
    return rpcSuccess(id, result.task);
  },

  "tasks/cancel"(params, id) {
    const parsed = tasksCancelSchema.safeParse(params);
    if (!parsed.success) {
      return rpcError(id, JSON_RPC_ERRORS.INVALID_PARAMS, "Invalid params", parsed.error.issues);
    }

    const result = taskManager.cancel(parsed.data.id);
    if (!result.success) {
      return rpcError(id, JSON_RPC_ERRORS.TASK_NOT_FOUND, result.error!);
    }
    return rpcSuccess(id, result.task);
  },

  "tasks/respond"(params, id) {
    const parsed = tasksRespondSchema.safeParse(params);
    if (!parsed.success) {
      return rpcError(id, JSON_RPC_ERRORS.INVALID_PARAMS, "Invalid params", parsed.error.issues);
    }

    const { id: taskId, parts, status, artifact_name, artifact_description } = parsed.data;
    const result = taskManager.respond(
      taskId,
      parts as Part[],
      status,
      artifact_name,
      artifact_description
    );
    if (!result.success) {
      const code = result.error?.includes("not found")
        ? JSON_RPC_ERRORS.TASK_NOT_FOUND
        : JSON_RPC_ERRORS.INVALID_TRANSITION;
      return rpcError(id, code, result.error!);
    }
    return rpcSuccess(id, result.task);
  },

  "tasks/list"(params, id) {
    const parsed = tasksListSchema.safeParse(params);
    if (!parsed.success) {
      return rpcError(id, JSON_RPC_ERRORS.INVALID_PARAMS, "Invalid params", parsed.error.issues);
    }

    const tasks = taskManager.listTasks(
      parsed.data.agent,
      parsed.data.role,
      parsed.data.limit,
      parsed.data.offset
    );
    return rpcSuccess(id, { tasks, count: tasks.length });
  },

  // SSE streaming handled separately in the router (not via JSON-RPC response)
  "tasks/sendSubscribe"(params, id) {
    // Validation only — actual SSE is handled in router.post
    const parsed = tasksSendSchema.safeParse(params);
    if (!parsed.success) {
      return rpcError(id, JSON_RPC_ERRORS.INVALID_PARAMS, "Invalid params", parsed.error.issues);
    }
    const result = taskManager.submit(parsed.data);
    if (!result.success) {
      return rpcError(id, JSON_RPC_ERRORS.AGENT_NOT_FOUND, result.error!);
    }
    // Return the task — SSE subscription is handled at router level
    return rpcSuccess(id, { ...result.task, _subscribe: true });
  },

  "tasks/pushNotification/set"(params, id) {
    const schema = z.object({
      task_id: z.string().min(1),
      webhook_url: z.string().url(),
      auth_token: z.string().optional(),
    });
    const parsed = schema.safeParse(params);
    if (!parsed.success) {
      return rpcError(id, JSON_RPC_ERRORS.INVALID_PARAMS, "Invalid params", parsed.error.issues);
    }

    const result = taskManager.getTask(parsed.data.task_id);
    if (!result.success) {
      return rpcError(id, JSON_RPC_ERRORS.TASK_NOT_FOUND, result.error!);
    }

    const subId = pushNotificationService.subscribe(
      parsed.data.task_id,
      parsed.data.webhook_url,
      parsed.data.auth_token
    );
    return rpcSuccess(id, { subscription_id: subId, task_id: parsed.data.task_id });
  },

  "tasks/pushNotification/get"(params, id) {
    const parsed = tasksGetSchema.safeParse(params);
    if (!parsed.success) {
      return rpcError(id, JSON_RPC_ERRORS.INVALID_PARAMS, "Invalid params", parsed.error.issues);
    }

    const sub = pushNotificationService.getSubscription(parsed.data.id);
    if (!sub) {
      return rpcSuccess(id, { subscription: null });
    }
    return rpcSuccess(id, { subscription: sub });
  },

  "tasks/resubscribe"(params, id) {
    const parsed = tasksGetSchema.safeParse(params);
    if (!parsed.success) {
      return rpcError(id, JSON_RPC_ERRORS.INVALID_PARAMS, "Invalid params", parsed.error.issues);
    }
    const result = taskManager.getTask(parsed.data.id);
    if (!result.success) {
      return rpcError(id, JSON_RPC_ERRORS.TASK_NOT_FOUND, result.error!);
    }
    return rpcSuccess(id, { ...result.task, _subscribe: true });
  },
};

/**
 * Creates the A2A JSON-RPC 2.0 router.
 */
export function createA2ARouter(): Router {
  const router = Router();

  // SSE endpoint for streaming task updates
  router.get("/tasks/:taskId/stream", (req, res) => {
    const taskId = req.params.taskId;
    const result = taskManager.getTask(taskId);
    if (!result.success) {
      res.status(404).json({ error: result.error });
      return;
    }
    taskStreamManager.subscribe(taskId, res);
  });

  // JSON-RPC endpoint
  router.post("/", (req, res) => {
    const body = req.body;

    // Validate JSON-RPC structure
    if (!body || body.jsonrpc !== "2.0" || !body.method || body.id === undefined) {
      res.status(400).json(
        rpcError(body?.id ?? null, JSON_RPC_ERRORS.INVALID_REQUEST, "Invalid JSON-RPC 2.0 request")
      );
      return;
    }

    const request = body as JsonRpcRequest;
    const handler = methods[request.method];

    if (!handler) {
      res.json(
        rpcError(request.id, JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Method '${request.method}' not found`)
      );
      return;
    }

    try {
      const response = handler(request.params, request.id);

      // If response has _subscribe flag, open SSE stream after sending initial response
      if (response.result && typeof response.result === "object" && (response.result as any)._subscribe) {
        const taskId = (response.result as any).id;
        // Remove internal flag before sending
        delete (response.result as any)._subscribe;
        // Send JSON-RPC response first, then the client should connect to GET /tasks/:id/stream
        // Include stream URL in response
        (response.result as any).stream_url = `/a2a/tasks/${taskId}/stream`;
      }

      res.json(response);
    } catch (err) {
      res.json(
        rpcError(request.id, JSON_RPC_ERRORS.INTERNAL_ERROR, (err as Error).message)
      );
    }
  });

  return router;
}
