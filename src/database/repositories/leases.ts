import type Database from "better-sqlite3";

export interface Lease {
  resource_id: string;
  agent_id: string;
  lease_type: string;
  acquired_at: string;
  expires_at: string;
  metadata: Record<string, unknown>;
}

export class LeaseRepository {
  constructor(readonly db: Database.Database) {}

  /** Remove expired leases before any check */
  private cleanup(): void {
    this.db
      .prepare(`DELETE FROM resource_leases WHERE expires_at < datetime('now')`)
      .run();
  }

  acquire(
    resourceId: string,
    agentId: string,
    leaseType: "exclusive" | "shared" = "exclusive",
    ttlSeconds: number = 300,
    metadata: Record<string, unknown> = {}
  ): { acquired: boolean; holder?: Lease } {
    // Use BEGIN IMMEDIATE to prevent race conditions
    const txn = this.db.transaction(() => {
      this.cleanup();

      const existing = this.db
        .prepare(`SELECT * FROM resource_leases WHERE resource_id = ?`)
        .get(resourceId) as Record<string, unknown> | undefined;

      if (existing) {
        const holder = this.rowToLease(existing);
        // Same agent can renew
        if (holder.agent_id === agentId) {
          const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
          this.db
            .prepare(
              `UPDATE resource_leases SET expires_at = ?, metadata = ?, lease_type = ? WHERE resource_id = ?`
            )
            .run(expiresAt, JSON.stringify(metadata), leaseType, resourceId);
          return { acquired: true } as { acquired: boolean; holder?: Lease };
        }
        // Exclusive lease held by someone else
        if (holder.lease_type === "exclusive" || leaseType === "exclusive") {
          return { acquired: false, holder } as { acquired: boolean; holder?: Lease };
        }
        // Both shared — allow (use INSERT OR IGNORE to avoid overwriting existing holder)
      }

      const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      this.db
        .prepare(
          `INSERT OR IGNORE INTO resource_leases (resource_id, agent_id, lease_type, expires_at, metadata)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(resourceId, agentId, leaseType, expiresAt, JSON.stringify(metadata));
      return { acquired: true } as { acquired: boolean; holder?: Lease };
    });

    return txn.immediate();
  }

  release(resourceId: string, agentId: string): boolean {
    const result = this.db
      .prepare(
        `DELETE FROM resource_leases WHERE resource_id = ? AND agent_id = ?`
      )
      .run(resourceId, agentId);
    return result.changes > 0;
  }

  check(resourceId: string): Lease | null {
    this.cleanup();
    const row = this.db
      .prepare(`SELECT * FROM resource_leases WHERE resource_id = ?`)
      .get(resourceId) as Record<string, unknown> | undefined;
    return row ? this.rowToLease(row) : null;
  }

  listAll(): Lease[] {
    this.cleanup();
    const rows = this.db
      .prepare(`SELECT * FROM resource_leases ORDER BY acquired_at DESC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToLease(r));
  }

  private rowToLease(row: Record<string, unknown>): Lease {
    return {
      resource_id: row.resource_id as string,
      agent_id: row.agent_id as string,
      lease_type: row.lease_type as string,
      acquired_at: row.acquired_at as string,
      expires_at: row.expires_at as string,
      metadata: JSON.parse((row.metadata as string) || "{}"),
    };
  }
}
