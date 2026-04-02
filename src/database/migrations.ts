import type Database from "better-sqlite3";

interface Migration {
  version: number;
  description: string;
  up(db: Database.Database): void;
}

const migrations: Migration[] = [
  {
    version: 1,
    description: "Add thread_participants junction table",
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS thread_participants (
          thread_id TEXT NOT NULL REFERENCES threads(id),
          agent_id TEXT NOT NULL,
          PRIMARY KEY (thread_id, agent_id)
        );
        CREATE INDEX IF NOT EXISTS idx_thread_participants_agent
          ON thread_participants(agent_id);
      `);

      // Backfill from existing JSON participants column
      const threads = db
        .prepare(`SELECT id, participants FROM threads`)
        .all() as Array<{ id: string; participants: string }>;

      const insert = db.prepare(
        `INSERT OR IGNORE INTO thread_participants (thread_id, agent_id) VALUES (?, ?)`
      );
      for (const thread of threads) {
        try {
          const agents: string[] = JSON.parse(thread.participants);
          for (const agent of agents) {
            if (agent) insert.run(thread.id, agent);
          }
        } catch {
          // Skip malformed JSON
        }
      }
    },
  },
  {
    version: 2,
    description: "Add A2A task tables",
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS a2a_tasks (
          id TEXT PRIMARY KEY,
          session_id TEXT,
          from_agent TEXT NOT NULL,
          to_agent TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'submitted',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          metadata TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS a2a_task_messages (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES a2a_tasks(id),
          role TEXT NOT NULL,
          parts TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS a2a_task_artifacts (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES a2a_tasks(id),
          name TEXT,
          description TEXT,
          parts TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_a2a_tasks_to_agent ON a2a_tasks(to_agent, status);
        CREATE INDEX IF NOT EXISTS idx_a2a_tasks_from_agent ON a2a_tasks(from_agent);
        CREATE INDEX IF NOT EXISTS idx_a2a_tasks_session ON a2a_tasks(session_id);
        CREATE INDEX IF NOT EXISTS idx_a2a_task_messages_task ON a2a_task_messages(task_id);
        CREATE INDEX IF NOT EXISTS idx_a2a_task_artifacts_task ON a2a_task_artifacts(task_id);
      `);
    },
  },
  {
    version: 3,
    description: "Add Agent Card columns to agent_registry",
    up(db: Database.Database) {
      db.exec(`
        ALTER TABLE agent_registry ADD COLUMN description TEXT NOT NULL DEFAULT '';
        ALTER TABLE agent_registry ADD COLUMN url TEXT NOT NULL DEFAULT '';
        ALTER TABLE agent_registry ADD COLUMN skills TEXT NOT NULL DEFAULT '[]';
        ALTER TABLE agent_registry ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'bearer';
        ALTER TABLE agent_registry ADD COLUMN version TEXT NOT NULL DEFAULT '1.0.0';
      `);
    },
  },
  {
    version: 4,
    description: "Add push notification subscriptions table",
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS a2a_push_subscriptions (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES a2a_tasks(id),
          webhook_url TEXT NOT NULL,
          auth_token TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_push_subs_task ON a2a_push_subscriptions(task_id);
      `);
    },
  },
  {
    version: 5,
    description: "Add resource leases table",
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS resource_leases (
          resource_id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          lease_type TEXT NOT NULL DEFAULT 'exclusive',
          acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at TEXT NOT NULL,
          metadata TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_leases_agent ON resource_leases(agent_id);
        CREATE INDEX IF NOT EXISTS idx_leases_expires ON resource_leases(expires_at);
      `);
    },
  },
  {
    version: 6,
    description: "Add dead-letter queue table",
    up(db: Database.Database) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS dead_letter_queue (
          id TEXT PRIMARY KEY,
          original_message_id TEXT NOT NULL,
          sender TEXT NOT NULL,
          recipient TEXT NOT NULL,
          subject TEXT NOT NULL,
          body TEXT NOT NULL,
          reason TEXT NOT NULL,
          moved_at TEXT NOT NULL DEFAULT (datetime('now')),
          retry_count INTEGER NOT NULL DEFAULT 0,
          last_retry_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_dlq_recipient ON dead_letter_queue(recipient);
      `);
    },
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = db
    .prepare(`SELECT version FROM schema_version ORDER BY version`)
    .all() as Array<{ version: number }>;
  const appliedVersions = new Set(applied.map((r) => r.version));

  const pending = migrations.filter((m) => !appliedVersions.has(m.version));
  if (pending.length === 0) return;

  const insertVersion = db.prepare(
    `INSERT INTO schema_version (version, description) VALUES (?, ?)`
  );

  for (const migration of pending) {
    const tx = db.transaction(() => {
      migration.up(db);
      insertVersion.run(migration.version, migration.description);
    });
    tx();
    console.error(
      `Migration v${migration.version}: ${migration.description}`
    );
  }
}

export function getCurrentVersion(db: Database.Database): number {
  try {
    const row = db
      .prepare(`SELECT MAX(version) as version FROM schema_version`)
      .get() as { version: number | null } | undefined;
    return row?.version ?? 0;
  } catch {
    return 0;
  }
}
