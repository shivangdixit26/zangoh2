import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.ts';
import { emit, toSummary } from '../events.ts';
import { asyncHandler, parse, supervisorOf } from '../lib/http.ts';
import { formatDuration } from '../lib/util.ts';
import { store } from '../store.ts';
import { acknowledge, syncAlerts } from '../services/alerts.ts';
import { kbStatus, retrieve } from '../services/knowledge.ts';
import { serviceHealth } from '../services/llm.ts';
import { computeMetrics } from '../services/metrics.ts';
import { spawnConversation } from '../services/simulator.ts';
import { canSee } from '../services/templates.ts';

export const systemRouter = Router();

systemRouter.get('/health', asyncHandler(async (_req, res) => {
  const [llm, vdb] = await Promise.all([serviceHealth(config.mockLlmUrl), serviceHealth(config.vectorDbUrl)]);
  res.json({ status: 'ok', time: Date.now(), services: { mockLlm: Boolean(llm), vectorDb: Boolean(vdb) }, knowledgeBase: kbStatus(), metricsStreams: sseClients });
}));

// ---- Alerts & feed ---------------------------------------------------------
systemRouter.get('/alerts', (req, res) => {
  const status = String(req.query.status ?? 'active');
  const items = store.state.alerts
    .filter((a) => (status === 'all' ? true : status === 'open' ? a.status === 'open' : a.status !== 'cleared'))
    .sort((a, b) => (a.severity === b.severity ? b.createdAt - a.createdAt : a.severity === 'critical' ? -1 : 1));
  res.json({ items });
});

systemRouter.post('/alerts/:id/ack', (req, res) => {
  res.json(acknowledge(req.params.id, supervisorOf(req)));
});

systemRouter.post('/alerts/ack-all', (req, res) => {
  const who = supervisorOf(req);
  const open = store.state.alerts.filter((a) => a.status === 'open');
  open.forEach((a) => acknowledge(a.id, who));
  res.json({ acknowledged: open.length });
});

systemRouter.get('/feed', (req, res) => {
  const limit = Math.min(100, Number(req.query.limit ?? 30) || 30);
  res.json({ items: store.state.feed.slice(0, limit) });
});

// ---- Metrics, search, export ----------------------------------------------
const metricsQuery = z.object({ range: z.coerce.number().int().min(5).max(7 * 24 * 60).default(30), region: z.string().default('all') });

systemRouter.get('/metrics', (req, res) => {
  const q = parse(metricsQuery, req.query);
  res.json(computeMetrics(q.range, q.region));
});

// Server-Sent Events: the dashboard subscribes once and receives freshly computed metrics every 2 seconds.
const streamQuery = metricsQuery.extend({ interval: z.coerce.number().int().min(1000).max(60_000).default(2000) });
let sseClients = 0;

systemRouter.get('/metrics/stream', (req, res) => {
  const q = parse(streamQuery, req.query);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // tell nginx not to buffer the stream
  });
  sseClients += 1;
  let seq = 0;
  const send = () => {
    seq += 1;
    res.write(`id: ${seq}\nevent: metrics\ndata: ${JSON.stringify({ ...computeMetrics(q.range, q.region), intervalMs: q.interval, seq })}\n\n`);
  };
  res.write('retry: 3000\n\n');
  send();
  const timer = setInterval(send, q.interval);
  req.on('close', () => {
    clearInterval(timer);
    sseClients -= 1;
  });
});

systemRouter.get('/search', (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  if (q.length < 2) return res.json({ conversations: [], agents: [], templates: [] });
  const conversations = store.state.conversations
    .filter((c) => [c.customer.name, c.caseNumber, `#${c.caseNumber}`, c.topic].some((s) => s.toLowerCase().includes(q)))
    .sort((a, b) => Number(a.status === 'resolved') - Number(b.status === 'resolved') || b.startedAt - a.startedAt)
    .slice(0, 6)
    .map((c) => ({ id: c.id, name: c.customer.name, caseNumber: c.caseNumber, topic: c.topic, status: c.status, priority: c.priority }));
  const agents = store.state.agents.filter((a) => `${a.name} ${a.description}`.toLowerCase().includes(q)).map((a) => ({ id: a.id, name: a.name, version: a.version, description: a.description }));
  const who = supervisorOf(req);
  const templates = store.state.templates
    .filter((t) => canSee(t, who) && `${t.name} ${t.title} ${t.category}`.toLowerCase().includes(q))
    .slice(0, 5)
    .map((t) => ({ id: t.id, name: t.name, category: t.category }));
  res.json({ conversations, agents, templates });
});

const csv = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

systemRouter.get('/export/report.csv', (req, res) => {
  const q = parse(metricsQuery, req.query);
  const m = computeMetrics(q.range, q.region);
  const since = Date.now() - q.range * 60_000;
  const rows = store.state.conversations
    .filter((c) => (q.region === 'all' || c.customer.region === q.region) && (c.status !== 'resolved' || (c.resolvedAt ?? 0) >= since))
    .map(toSummary);
  const lines = [
    `# Supervisor report • last ${q.range} min • region: ${q.region} • generated ${new Date().toISOString()}`,
    `# Active load,${m.kpis.activeLoad.value}`,
    `# SLA at risk,${m.kpis.slaAtRisk.value}`,
    `# AI containment %,${m.kpis.containment.value ?? ''}`,
    `# Avg handle time,${m.kpis.avgHandleSec.value == null ? '' : formatDuration(m.kpis.avgHandleSec.value * 1000)}`,
    `# CSAT,${m.kpis.csat.value ?? ''}`,
    ['case', 'customer', 'region', 'queue', 'agent', 'status', 'control', 'priority', 'risk', 'sentiment', 'ai_confidence', 'started_at', 'resolved_at', 'resolved_by', 'csat'].join(','),
    ...rows.map((c) => [c.caseNumber, c.customer.name, c.customer.region, c.queue, c.agentId, c.status, c.control, c.priority, c.risk, c.sentiment, c.aiConfidence,
      new Date(c.startedAt).toISOString(), c.resolvedAt ? new Date(c.resolvedAt).toISOString() : '', c.resolvedBy ?? '', c.csat ?? ''].map(csv).join(',')),
  ];
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="supervisor-report-${q.range}m.csv"`);
  res.send(lines.join('\n'));
});

// ---- Knowledge base -------------------------------------------------------
systemRouter.get('/knowledge/search', asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '');
  const agentId = String(req.query.agentId ?? '');
  const agent = store.state.agents.find((a) => a.id === agentId);
  const draft = agent ? store.state.drafts[agent.id] : undefined;
  const cfg = draft?.config ?? agent?.config;
  const sources = cfg ? Object.entries(cfg.knowledge).filter(([, on]) => on).map(([k]) => k) : ['returns', 'shipping', 'account', 'product', 'billing', 'general', 'safety'];
  res.json({ results: await retrieve(q, sources, 3), sources });
}));

// ---- Simulator & admin ----------------------------------------------------
systemRouter.get('/simulator', (_req, res) => res.json(store.state.simulator));

systemRouter.put('/simulator', (req, res) => {
  const body = parse(z.object({ running: z.boolean().optional(), speed: z.number().min(0.25).max(4).optional() }), req.body ?? {});
  Object.assign(store.state.simulator, body);
  store.save();
  emit.simulator();
  res.json(store.state.simulator);
});

systemRouter.post('/simulator/spawn', (_req, res) => {
  const conv = spawnConversation();
  syncAlerts();
  res.status(201).json(toSummary(conv));
});

systemRouter.post('/admin/reset', (_req, res) => {
  store.reset();
  syncAlerts();
  emit.reset();
  res.json({ ok: true });
});
