import type { ServerResponse } from "node:http";
import type { Response } from "express";
import { eventBus } from "../events/event-bus.js";
import type { A2ATask, TaskState } from "../types/a2a.js";

export interface TaskStatusEvent {
  task_id: string;
  status: TaskState;
  timestamp: string;
  task?: A2ATask;
}

/**
 * Manages SSE connections for A2A task streaming.
 */
export class TaskStreamManager {
  private subscribers = new Map<string, Set<Response>>();

  /**
   * Subscribe an SSE client to task updates.
   */
  subscribe(taskId: string, res: Response): void {
    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ task_id: taskId })}\n\n`);

    if (!this.subscribers.has(taskId)) {
      this.subscribers.set(taskId, new Set());
    }
    this.subscribers.get(taskId)!.add(res);

    // Cleanup on disconnect
    res.on("close", () => {
      this.unsubscribe(taskId, res);
    });
  }

  /**
   * Remove an SSE client.
   */
  unsubscribe(taskId: string, res: Response): void {
    const subs = this.subscribers.get(taskId);
    if (subs) {
      subs.delete(res);
      if (subs.size === 0) {
        this.subscribers.delete(taskId);
      }
    }
  }

  /**
   * Emit a task status event to all SSE subscribers.
   */
  emit(event: TaskStatusEvent): void {
    const subs = this.subscribers.get(event.task_id);
    if (subs) {
      const data = JSON.stringify(event);
      for (const res of subs) {
        try {
          res.write(`event: task-status\ndata: ${data}\n\n`);
        } catch {
          // Client disconnected, cleanup
          this.unsubscribe(event.task_id, res);
        }
      }
    }

    // Also publish to event bus for internal consumers
    eventBus.publish(`task:${event.task_id}`, event);
  }

  /**
   * Get the number of active subscribers for a task.
   */
  subscriberCount(taskId: string): number {
    return this.subscribers.get(taskId)?.size || 0;
  }

  /**
   * Get total number of active SSE connections.
   */
  totalConnections(): number {
    let total = 0;
    for (const subs of this.subscribers.values()) {
      total += subs.size;
    }
    return total;
  }
}

// Singleton
export const taskStreamManager = new TaskStreamManager();
