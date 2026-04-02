import { getRepos } from "../database/index.js";
import type { A2ATask, Part, TaskState } from "../types/a2a.js";
import { VALID_TRANSITIONS, TERMINAL_STATES } from "../types/a2a.js";
import { taskStreamManager } from "./streaming.js";
import { pushNotificationService } from "./push-notifications.js";

export interface SubmitTaskParams {
  from_agent: string;
  to_agent: string;
  message: {
    role: "user" | "agent";
    parts: Part[];
  };
  session_id?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskManagerResult {
  success: boolean;
  task?: A2ATask;
  error?: string;
}

export class TaskManager {
  /**
   * Submit a new task or continue an existing one.
   */
  submit(params: SubmitTaskParams): TaskManagerResult {
    const { tasks, agents } = getRepos();

    // Verify target agent exists
    const targetAgent = agents.findById(params.to_agent);
    if (!targetAgent) {
      return { success: false, error: `Agent '${params.to_agent}' not found in registry` };
    }

    const taskId = tasks.create({
      from_agent: params.from_agent,
      to_agent: params.to_agent,
      session_id: params.session_id,
      metadata: params.metadata,
    });

    tasks.addMessage(taskId, params.message.role, params.message.parts);

    const task = tasks.findByIdWithDetails(taskId);
    return { success: true, task: task! };
  }

  /**
   * Get a task by ID with full message and artifact history.
   */
  getTask(taskId: string): TaskManagerResult {
    const { tasks } = getRepos();
    const task = tasks.findByIdWithDetails(taskId);
    if (!task) {
      return { success: false, error: `Task '${taskId}' not found` };
    }
    return { success: true, task };
  }

  /**
   * Update task status with transition validation.
   */
  updateStatus(taskId: string, newStatus: TaskState, message?: { role: "user" | "agent"; parts: Part[] }): TaskManagerResult {
    const { tasks } = getRepos();

    try {
      const updated = tasks.updateStatus(taskId, newStatus);
      if (!updated) {
        return { success: false, error: `Task '${taskId}' not found` };
      }
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }

    if (message) {
      tasks.addMessage(taskId, message.role, message.parts);
    }

    const task = tasks.findByIdWithDetails(taskId);

    // Emit SSE event and push notifications
    const statusEvent = {
      task_id: taskId,
      status: newStatus,
      timestamp: new Date().toISOString(),
      task: task!,
    };
    taskStreamManager.emit(statusEvent);
    pushNotificationService.notify(taskId, statusEvent).catch(() => {
      // Fire-and-forget — don't block on webhook delivery
    });

    return { success: true, task: task! };
  }

  /**
   * Cancel a task.
   */
  cancel(taskId: string): TaskManagerResult {
    return this.updateStatus(taskId, "canceled");
  }

  /**
   * Respond to a task (agent sends result).
   */
  respond(
    taskId: string,
    parts: Part[],
    newStatus: TaskState = "completed",
    artifactName?: string,
    artifactDescription?: string
  ): TaskManagerResult {
    const { tasks } = getRepos();
    const task = tasks.findById(taskId);
    if (!task) {
      return { success: false, error: `Task '${taskId}' not found` };
    }

    // Add agent response as message
    tasks.addMessage(taskId, "agent", parts);

    // Add as artifact if it's a completion
    if (newStatus === "completed" || newStatus === "failed") {
      tasks.addArtifact(taskId, parts, artifactName, artifactDescription);
    }

    // Update status
    try {
      tasks.updateStatus(taskId, newStatus);
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }

    const result = tasks.findByIdWithDetails(taskId);
    return { success: true, task: result! };
  }

  /**
   * List tasks for an agent.
   */
  listTasks(
    agent: string,
    role: "from" | "to" = "to",
    limit: number = 20,
    offset: number = 0
  ): A2ATask[] {
    const { tasks } = getRepos();
    return tasks.findByAgent(agent, role, limit, offset);
  }
}
