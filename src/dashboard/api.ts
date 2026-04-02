import { Router } from "express";
import { getRepos } from "../database/index.js";
import { taskStreamManager } from "../a2a/streaming.js";

export function createDashboardApiRouter(): Router {
  const router = Router();

  router.get("/agents", (_req, res) => {
    const { agents } = getRepos();
    res.json(agents.listAll());
  });

  router.get("/messages/recent", (req, res) => {
    const { messages } = getRepos();
    const minutes = parseInt(req.query.minutes as string) || 60;
    const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    const activity = messages.findActivitySince(cutoff);
    const stats = messages.getActivityStats(cutoff);
    res.json({ activity, stats });
  });

  router.get("/tasks", (req, res) => {
    const { tasks } = getRepos();
    const agent = req.query.agent as string;
    if (agent) {
      res.json(tasks.findByAgent(agent, "to", 50));
    } else {
      // Return recent tasks across all agents
      const db = tasks.db;
      const rows = db
        .prepare(`SELECT * FROM a2a_tasks ORDER BY updated_at DESC LIMIT 50`)
        .all();
      res.json(rows);
    }
  });

  router.get("/stats", (_req, res) => {
    const { agents, messages, tasks, leases, deadLetter } = getRepos();
    const agentList = agents.listAll();
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const msgStats = messages.getActivityStats(cutoff);

    let taskCount = 0;
    let leaseCount = 0;
    let dlqCount = 0;
    try {
      const db = tasks.db;
      taskCount = (db.prepare(`SELECT COUNT(*) as c FROM a2a_tasks`).get() as any).c;
      leaseCount = leases.listAll().length;
      dlqCount = deadLetter.count();
    } catch { /* tables may not exist yet */ }

    res.json({
      agents: agentList.length,
      messages: msgStats,
      tasks: taskCount,
      leases: leaseCount,
      dead_letters: dlqCount,
      sse_connections: taskStreamManager.totalConnections(),
    });
  });

  router.get("/leases", (_req, res) => {
    const { leases } = getRepos();
    res.json(leases.listAll());
  });

  router.get("/dlq", (_req, res) => {
    const { deadLetter } = getRepos();
    res.json({ entries: deadLetter.list(), count: deadLetter.count() });
  });

  return router;
}
