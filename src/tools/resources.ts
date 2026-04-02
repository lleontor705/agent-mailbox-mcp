import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../database/index.js";
import { LeaseRepository } from "../database/repositories/leases.js";

function getLeaseRepo(): LeaseRepository {
  return new LeaseRepository(getDb());
}

export function registerResourceTools(server: McpServer): void {
  server.tool(
    "resource_acquire",
    "Acquire an advisory lease on a resource. Used for coordinating exclusive or shared access between agents.",
    {
      resource_id: z.string().min(1).max(512).describe("Resource identifier (e.g. file path, URL, key)"),
      agent: z.string().min(1).max(256).regex(/^[a-zA-Z0-9_.-]+$/).describe("Agent acquiring the lease"),
      lease_type: z.enum(["exclusive", "shared"]).default("exclusive").describe("Lease type"),
      ttl_seconds: z.number().min(1).max(86400).default(300).describe("Lease duration in seconds"),
      metadata: z.record(z.string()).optional().describe("Optional metadata"),
    },
    async ({ resource_id, agent, lease_type, ttl_seconds, metadata }) => {
      const leases = getLeaseRepo();
      const result = leases.acquire(resource_id, agent, lease_type, ttl_seconds, metadata);

      if (!result.acquired) {
        return { content: [{ type: "text" as const, text: JSON.stringify({
          acquired: false,
          resource_id,
          reason: "Resource is held by another agent",
          holder: result.holder,
        }) }] };
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({
        acquired: true, resource_id, agent, lease_type, ttl_seconds,
      }) }] };
    }
  );

  server.tool(
    "resource_release",
    "Release a previously acquired resource lease.",
    {
      resource_id: z.string().min(1).max(512).describe("Resource identifier"),
      agent: z.string().min(1).max(256).regex(/^[a-zA-Z0-9_.-]+$/).describe("Agent releasing the lease"),
    },
    async ({ resource_id, agent }) => {
      const leases = getLeaseRepo();
      const released = leases.release(resource_id, agent);

      return { content: [{ type: "text" as const, text: JSON.stringify({
        released, resource_id, agent,
      }) }] };
    }
  );

  server.tool(
    "resource_check",
    "Check the current lease status of a resource.",
    {
      resource_id: z.string().min(1).max(512).describe("Resource identifier"),
    },
    async ({ resource_id }) => {
      const leases = getLeaseRepo();
      const lease = leases.check(resource_id);

      return { content: [{ type: "text" as const, text: JSON.stringify({
        resource_id,
        held: !!lease,
        lease: lease || null,
      }) }] };
    }
  );

  server.tool(
    "resource_list",
    "List all active resource leases.",
    {},
    async () => {
      const leases = getLeaseRepo();
      const list = leases.listAll();

      return { content: [{ type: "text" as const, text: JSON.stringify({
        count: list.length, leases: list,
      }) }] };
    }
  );
}
