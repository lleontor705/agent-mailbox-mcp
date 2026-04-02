import { describe, it, expect } from "vitest";
import { TaskStreamManager } from "../../src/a2a/streaming.js";

describe("TaskStreamManager", () => {
  it("starts with zero connections", () => {
    const manager = new TaskStreamManager();
    expect(manager.totalConnections()).toBe(0);
    expect(manager.subscriberCount("task-123")).toBe(0);
  });

  it("tracks subscriber count correctly", () => {
    const manager = new TaskStreamManager();

    // Create mock SSE responses
    const mockRes1 = createMockResponse();
    const mockRes2 = createMockResponse();

    manager.subscribe("task-1", mockRes1 as any);
    expect(manager.subscriberCount("task-1")).toBe(1);
    expect(manager.totalConnections()).toBe(1);

    manager.subscribe("task-1", mockRes2 as any);
    expect(manager.subscriberCount("task-1")).toBe(2);
    expect(manager.totalConnections()).toBe(2);
  });

  it("removes subscribers on unsubscribe", () => {
    const manager = new TaskStreamManager();
    const mockRes = createMockResponse();

    manager.subscribe("task-1", mockRes as any);
    expect(manager.subscriberCount("task-1")).toBe(1);

    manager.unsubscribe("task-1", mockRes as any);
    expect(manager.subscriberCount("task-1")).toBe(0);
  });

  it("emits events to all subscribers", () => {
    const manager = new TaskStreamManager();
    const writes1: string[] = [];
    const writes2: string[] = [];

    const mockRes1 = createMockResponse((data) => writes1.push(data));
    const mockRes2 = createMockResponse((data) => writes2.push(data));

    manager.subscribe("task-1", mockRes1 as any);
    manager.subscribe("task-1", mockRes2 as any);

    manager.emit({
      task_id: "task-1",
      status: "working",
      timestamp: new Date().toISOString(),
    });

    // Each should receive: connected event + status event
    // Connected: 1 writeHead + 1 write, Status: 1 write
    expect(writes1.some((w) => w.includes("task-status"))).toBe(true);
    expect(writes2.some((w) => w.includes("task-status"))).toBe(true);
  });

  it("handles emit to task with no subscribers", () => {
    const manager = new TaskStreamManager();
    // Should not throw
    expect(() => {
      manager.emit({
        task_id: "no-subscribers",
        status: "completed",
        timestamp: new Date().toISOString(),
      });
    }).not.toThrow();
  });

  it("cleans up on close event", () => {
    const manager = new TaskStreamManager();
    const handlers: Record<string, Function> = {};
    const mockRes = {
      writeHead: () => {},
      write: () => {},
      on: (event: string, handler: Function) => {
        handlers[event] = handler;
      },
    };

    manager.subscribe("task-1", mockRes as any);
    expect(manager.subscriberCount("task-1")).toBe(1);

    // Simulate disconnect
    handlers["close"]();
    expect(manager.subscriberCount("task-1")).toBe(0);
  });
});

function createMockResponse(onWrite?: (data: string) => void) {
  return {
    writeHead: () => {},
    write: (data: string) => {
      onWrite?.(data);
    },
    on: () => {},
  };
}
