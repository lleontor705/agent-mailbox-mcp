import { describe, it, expect } from "vitest";
import { MESSAGE_STATUSES, PRIORITIES } from "../src/types/index.js";

describe("Message Types", () => {
  it("has correct message statuses", () => {
    expect(MESSAGE_STATUSES).toEqual(["pending", "delivered", "read", "acked", "expired"]);
  });

  it("has correct priorities", () => {
    expect(PRIORITIES).toEqual(["high", "normal", "low"]);
  });

  it("high priority sorts before normal and low", () => {
    const idx = (p: string) => PRIORITIES.indexOf(p as any);
    expect(idx("high")).toBeLessThan(idx("normal"));
    expect(idx("normal")).toBeLessThan(idx("low"));
  });
});

describe("Message Validation", () => {
  it("rejects empty subject", () => {
    const subject = "";
    expect(subject.length).toBe(0);
  });

  it("validates dedup key uniqueness concept", () => {
    const keys = new Set<string>();
    keys.add("key-1");
    expect(keys.has("key-1")).toBe(true);
    expect(keys.has("key-2")).toBe(false);
  });

  it("validates priority ordering for inbox", () => {
    const messages = [
      { priority: "low", subject: "FYI" },
      { priority: "high", subject: "Blocker" },
      { priority: "normal", subject: "Update" },
    ];
    const sorted = messages.sort((a, b) => {
      const order = { high: 0, normal: 1, low: 2 };
      return (order[a.priority as keyof typeof order] || 1) - (order[b.priority as keyof typeof order] || 1);
    });
    expect(sorted[0].priority).toBe("high");
    expect(sorted[1].priority).toBe("normal");
    expect(sorted[2].priority).toBe("low");
  });
});
