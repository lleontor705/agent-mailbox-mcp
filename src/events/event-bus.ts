import { EventEmitter } from "node:events";

/**
 * In-process event bus for real-time notifications.
 * Used to replace polling patterns (msg_request) and power SSE streaming.
 */
class EventBusImpl extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(1000); // Support many concurrent listeners
  }

  /**
   * Wait for an event on a channel with timeout.
   * Returns the payload or throws on timeout.
   */
  waitFor<T = unknown>(channel: string, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeListener(channel, handler);
        reject(new Error(`Timeout waiting for event on channel '${channel}'`));
      }, timeoutMs);

      const handler = (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      };

      this.once(channel, handler);
    });
  }

  /**
   * Subscribe to a channel. Returns unsubscribe function.
   */
  subscribe<T = unknown>(
    channel: string,
    handler: (payload: T) => void
  ): () => void {
    this.on(channel, handler);
    return () => this.removeListener(channel, handler);
  }

  /**
   * Emit an event to all listeners on a channel.
   */
  publish(channel: string, payload: unknown): void {
    this.emit(channel, payload);
  }
}

// Singleton
export const eventBus = new EventBusImpl();
