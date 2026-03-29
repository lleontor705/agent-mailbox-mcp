import { randomUUID } from "node:crypto";

export function generateId(prefix: string = ""): string {
  const uuid = randomUUID().split("-")[0];
  return prefix ? `${prefix}-${uuid}` : uuid;
}
