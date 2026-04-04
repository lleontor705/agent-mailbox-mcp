import { randomUUID } from "node:crypto";

export function generateId(prefix: string = ""): string {
  const uuid = randomUUID().replace(/-/g, "");
  return prefix ? `${prefix}-${uuid}` : uuid;
}
