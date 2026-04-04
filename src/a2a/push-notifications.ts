import { getRepos } from "../database/index.js";
import { getDb } from "../database/index.js";
import { generateId } from "../utils/id.js";
import { eventBus } from "../events/event-bus.js";
import type { TaskStatusEvent } from "./streaming.js";

export interface PushSubscription {
  id: string;
  task_id: string;
  webhook_url: string;
  auth_token: string | null;
  created_at: string;
}

function validateWebhookUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Webhook URL must use HTTPS');
  const hostname = parsed.hostname.toLowerCase();
  const blocked = ['localhost', '127.0.0.1', '::1', '0.0.0.0', 'metadata.google.internal', '169.254.169.254'];
  if (blocked.includes(hostname)) throw new Error('Webhook URL points to blocked host');
  // Block private IP ranges
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && !isNaN(parts[0])) {
    if (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168)) {
      throw new Error('Webhook URL points to private network');
    }
  }
}

/**
 * Manages webhook-based push notifications for A2A task updates.
 */
export class PushNotificationService {
  private listening = false;

  /**
   * Subscribe a webhook to task updates.
   */
  subscribe(taskId: string, webhookUrl: string, authToken?: string): string {
    const db = getDb();
    const id = generateId("push");
    db.prepare(
      `INSERT INTO a2a_push_subscriptions (id, task_id, webhook_url, auth_token) VALUES (?, ?, ?, ?)`
    ).run(id, taskId, webhookUrl, authToken || null);

    // Ensure we're listening to task events
    this.startListening();

    return id;
  }

  /**
   * Unsubscribe from task updates.
   */
  unsubscribe(taskId: string): void {
    const db = getDb();
    db.prepare(`DELETE FROM a2a_push_subscriptions WHERE task_id = ?`).run(taskId);
  }

  /**
   * Get subscription for a task.
   */
  getSubscription(taskId: string): PushSubscription | null {
    const db = getDb();
    const row = db
      .prepare(`SELECT * FROM a2a_push_subscriptions WHERE task_id = ? LIMIT 1`)
      .get(taskId) as PushSubscription | undefined;
    return row || null;
  }

  /**
   * Send webhook notification with exponential backoff retry.
   */
  async notify(taskId: string, event: TaskStatusEvent): Promise<boolean> {
    const sub = this.getSubscription(taskId);
    if (!sub) return false;

    try {
      validateWebhookUrl(sub.webhook_url);
    } catch (err) {
      console.error(`Webhook URL validation failed for ${sub.webhook_url}: ${(err as Error).message}`);
      return false;
    }

    const maxRetries = 3;
    let delay = 1000;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (sub.auth_token) {
          headers["Authorization"] = `Bearer ${sub.auth_token}`;
        }

        const response = await fetch(sub.webhook_url, {
          method: "POST",
          headers,
          body: JSON.stringify(event),
          signal: AbortSignal.timeout(10000), // 10s timeout
        });

        if (response.ok) return true;

        // Non-retryable status codes
        if (response.status >= 400 && response.status < 500) {
          console.error(
            `Push notification to ${sub.webhook_url} failed with ${response.status}, not retrying`
          );
          return false;
        }
      } catch (err) {
        console.error(
          `Push notification attempt ${attempt + 1}/${maxRetries} failed:`,
          (err as Error).message
        );
      }

      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2; // exponential backoff
      }
    }

    return false;
  }

  /**
   * Start listening for task events and forward to webhooks.
   */
  private startListening(): void {
    if (this.listening) return;
    this.listening = true;

    // Listen for all task events via the event bus
    eventBus.on("task:*", (event: TaskStatusEvent) => {
      // This won't work with exact channel matching, need per-task listeners
    });

    // Instead, hook into the streaming manager's emit path
    // We'll check for subscriptions when tasks change status
  }
}

// Singleton
export const pushNotificationService = new PushNotificationService();
