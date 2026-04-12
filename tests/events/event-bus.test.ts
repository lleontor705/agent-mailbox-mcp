import { describe, it, expect, afterEach } from "vitest";
import { eventBus } from "../../src/events/event-bus.js";

afterEach(() => {
  eventBus.removeAllListeners();
});

describe("EventBus", () => {
  it("emits and receives events", async () => {
    const received: unknown[] = [];
    eventBus.subscribe("test-channel", (payload) => {
      received.push(payload);
    });

    eventBus.publish("test-channel", { data: "hello" });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ data: "hello" });
  });

  it("waitFor resolves when event is emitted", async () => {
    setTimeout(() => {
      eventBus.publish("delayed-channel", { value: 42 });
    }, 50);

    const result = await eventBus.waitFor<{ value: number }>("delayed-channel", 5000);
    expect(result.value).toBe(42);
  });

  it("waitFor rejects on timeout", async () => {
    await expect(
      eventBus.waitFor("never-emitted", 100)
    ).rejects.toThrow("Timeout");
  });

  it("subscribe returns unsubscribe function", () => {
    const received: unknown[] = [];
    const unsub = eventBus.subscribe("unsub-test", (payload) => {
      received.push(payload);
    });

    eventBus.publish("unsub-test", "first");
    unsub();
    eventBus.publish("unsub-test", "second");

    expect(received).toHaveLength(1);
    expect(received[0]).toBe("first");
  });

  it("supports multiple subscribers on same channel", () => {
    const results: string[] = [];
    eventBus.subscribe("multi", () => results.push("a"));
    eventBus.subscribe("multi", () => results.push("b"));

    eventBus.publish("multi", null);
    expect(results).toEqual(["a", "b"]);
  });

  it("does not cross-talk between channels", () => {
    const results: string[] = [];
    eventBus.subscribe("channel-a", () => results.push("a"));
    eventBus.subscribe("channel-b", () => results.push("b"));

    eventBus.publish("channel-a", null);
    expect(results).toEqual(["a"]);
  });
});
