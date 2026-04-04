import { Router } from "express";
import { createDashboardApiRouter } from "./api.js";

export function createDashboardRouter(): Router {
  const router = Router();

  // API routes
  router.use("/api", createDashboardApiRouter());

  // Dashboard HTML
  router.get("/", (_req, res) => {
    res.type("html").send(getDashboardHtml());
  });

  return router;
}

function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent Mailbox MCP - Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f1117; color: #e1e4e8; padding: 20px; }
  h1 { font-size: 1.5rem; margin-bottom: 20px; color: #58a6ff; }
  h2 { font-size: 1.1rem; margin-bottom: 10px; color: #8b949e; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }
  .card .value { font-size: 2rem; font-weight: bold; color: #58a6ff; }
  .card .label { font-size: 0.85rem; color: #8b949e; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #21262d; font-size: 0.9rem; }
  th { color: #8b949e; font-weight: 600; }
  .status { padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; }
  .status-pending { background: #1f2937; color: #fbbf24; }
  .status-delivered { background: #1f2937; color: #60a5fa; }
  .status-acked { background: #1f2937; color: #34d399; }
  .status-working { background: #1f2937; color: #a78bfa; }
  .status-completed { background: #1f2937; color: #34d399; }
  .status-failed { background: #1f2937; color: #f87171; }
  .status-submitted { background: #1f2937; color: #fbbf24; }
  .section { margin-bottom: 32px; }
  .refresh { color: #8b949e; font-size: 0.8rem; }
</style>
</head>
<body>
<h1>Agent Mailbox MCP Dashboard</h1>
<div class="refresh" id="refresh">Loading...</div>

<div class="section">
<h2>Overview</h2>
<div class="grid" id="stats"></div>
</div>

<div class="section">
<h2>Agents</h2>
<table id="agents"><thead><tr><th>Name</th><th>Role</th><th>Last Active</th></tr></thead><tbody></tbody></table>
</div>

<div class="section">
<h2>Recent Messages (1h)</h2>
<table id="messages"><thead><tr><th>From</th><th>To</th><th>Subject</th><th>Status</th><th>Time</th></tr></thead><tbody></tbody></table>
</div>

<div class="section">
<h2>A2A Tasks</h2>
<table id="tasks"><thead><tr><th>ID</th><th>From</th><th>To</th><th>Status</th><th>Updated</th></tr></thead><tbody></tbody></table>
</div>

<script>
async function fetchJson(url) {
  const res = await fetch(url);
  return res.json();
}

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function statusBadge(status) {
  return '<span class="status status-' + esc(status) + '">' + esc(status) + '</span>';
}

function timeAgo(iso) {
  if (!iso) return '-';
  const d = new Date(iso + 'Z');
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  return Math.floor(s/3600) + 'h ago';
}

async function refresh() {
  try {
    const [stats, agents, msgs, tasks] = await Promise.all([
      fetchJson('/dashboard/api/stats'),
      fetchJson('/dashboard/api/agents'),
      fetchJson('/dashboard/api/messages/recent?minutes=60'),
      fetchJson('/dashboard/api/tasks'),
    ]);

    document.getElementById('stats').innerHTML =
      '<div class="card"><div class="value">' + stats.agents + '</div><div class="label">Agents</div></div>' +
      '<div class="card"><div class="value">' + (stats.messages?.total || 0) + '</div><div class="label">Messages (1h)</div></div>' +
      '<div class="card"><div class="value">' + stats.tasks + '</div><div class="label">A2A Tasks</div></div>' +
      '<div class="card"><div class="value">' + stats.leases + '</div><div class="label">Active Leases</div></div>' +
      '<div class="card"><div class="value">' + stats.dead_letters + '</div><div class="label">Dead Letters</div></div>' +
      '<div class="card"><div class="value">' + stats.sse_connections + '</div><div class="label">SSE Streams</div></div>';

    var ab = document.querySelector('#agents tbody');
    ab.innerHTML = agents.map(function(a) {
      return '<tr><td>' + esc(a.id) + '</td><td>' + esc(a.role||'-') + '</td><td>' + timeAgo(a.last_active) + '</td></tr>';
    }).join('');

    var mb = document.querySelector('#messages tbody');
    mb.innerHTML = (msgs.activity||[]).slice(0,20).map(function(m) {
      return '<tr><td>' + esc(m.sender) + '</td><td>' + esc(m.recipient) + '</td><td>' + esc(m.subject) + '</td><td>' + statusBadge(m.status) + '</td><td>' + timeAgo(m.created_at) + '</td></tr>';
    }).join('') || '<tr><td colspan="5">No recent messages</td></tr>';

    var tb = document.querySelector('#tasks tbody');
    tb.innerHTML = (tasks||[]).slice(0,20).map(function(t) {
      return '<tr><td>' + esc(t.id) + '</td><td>' + esc(t.from_agent) + '</td><td>' + esc(t.to_agent) + '</td><td>' + statusBadge(t.status) + '</td><td>' + timeAgo(t.updated_at) + '</td></tr>';
    }).join('') || '<tr><td colspan="5">No tasks</td></tr>';

    document.getElementById('refresh').textContent = 'Last updated: ' + new Date().toLocaleTimeString() + ' (auto-refresh 10s)';
  } catch(e) {
    document.getElementById('refresh').textContent = 'Error: ' + e.message;
  }
}

refresh();
setInterval(refresh, 10000);
</script>
</body>
</html>`;
}
