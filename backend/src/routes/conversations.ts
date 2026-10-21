import { Router } from 'express';
import { z } from 'zod';
import { toSummary } from '../events.ts';
import { asyncHandler, parse, supervisorOf } from '../lib/http.ts';
import { store } from '../store.ts';
import { getCopilot } from '../services/agentRuntime.ts';
import * as ops from '../services/conversations.ts';

export const conversationsRouter = Router();

const listQuery = z.object({
  status: z.enum(['open', 'active', 'escalated', 'resolved', 'all']).default('open'),
  queue: z.string().optional(),
  priority: z.enum(['critical', 'high', 'watch', 'normal']).optional(),
  control: z.enum(['ai', 'supervisor']).optional(),
  region: z.string().optional(),
  channel: z.string().optional(),
  agentId: z.string().optional(),
  q: z.string().max(100).optional(),
  sort: z.enum(['risk', 'wait', 'newest']).default('risk'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

conversationsRouter.get('/', (req, res) => {
  const f = parse(listQuery, req.query);
  const needle = f.q?.trim().toLowerCase();
  const items = store.state.conversations.filter((c) => {
    if (f.status === 'open' && c.status === 'resolved') return false;
    if (f.status !== 'open' && f.status !== 'all' && c.status !== f.status) return false;
    if (f.queue && f.queue !== 'all' && c.queue !== f.queue) return false;
    if (f.priority && c.priority !== f.priority) return false;
    if (f.control && c.control !== f.control) return false;
    if (f.region && f.region !== 'all' && c.customer.region !== f.region) return false;
    if (f.channel && f.channel !== 'all' && c.channel !== f.channel) return false;
    if (f.agentId && c.agentId !== f.agentId) return false;
    if (needle && ![c.customer.name, c.caseNumber, `#${c.caseNumber}`, c.topic, c.queue].some((s) => s.toLowerCase().includes(needle))) return false;
    return true;
  });
  const summaries = items.map(toSummary);
  summaries.sort((a, b) => {
    if (f.sort === 'newest') return b.startedAt - a.startedAt;
    if (f.sort === 'wait') return (a.waitingSince ?? Infinity) - (b.waitingSince ?? Infinity);
    return b.risk - a.risk || a.startedAt - b.startedAt;
  });
  res.json({ items: summaries.slice(0, f.limit), total: summaries.length });
});

conversationsRouter.get('/:id', (req, res) => {
  const conv = store.conversation(req.params.id);
  res.json({ ...toSummary(conv), messages: conv.messages });
});

const full = (id: string) => {
  const conv = store.conversation(id);
  return { ...toSummary(conv), messages: conv.messages };
};

conversationsRouter.post('/:id/takeover', (req, res) => {
  ops.takeOver(req.params.id, supervisorOf(req));
  res.json(full(req.params.id));
});

conversationsRouter.post('/:id/return', (req, res) => {
  const body = parse(z.object({ notes: z.string().max(2000).default(''), shareWithAi: z.boolean().default(true) }), req.body ?? {});
  ops.returnToAi(req.params.id, supervisorOf(req), body.notes, body.shareWithAi);
  res.json(full(req.params.id));
});

conversationsRouter.post('/:id/messages', (req, res) => {
  const body = parse(z.object({
    text: z.string().trim().min(1, 'Message cannot be empty').max(2000),
    templateId: z.string().nullish(),
    source: z.enum(['typed', 'voice', 'template']).default('typed'),
  }), req.body ?? {});
  ops.sendSupervisorMessage(req.params.id, supervisorOf(req), body.text, body.templateId ? { id: body.templateId } : null, body.source);
  res.status(201).json(full(req.params.id));
});

conversationsRouter.post('/:id/resolve', (req, res) => {
  const body = parse(z.object({ notes: z.string().max(4000).optional() }), req.body ?? {});
  ops.resolve(req.params.id, supervisorOf(req), body.notes);
  res.json(full(req.params.id));
});

conversationsRouter.put('/:id/notes', (req, res) => {
  const body = parse(z.object({ notes: z.string().max(4000) }), req.body ?? {});
  ops.updateFeedbackNotes(req.params.id, body.notes);
  res.json({ ok: true });
});

conversationsRouter.get('/:id/copilot', asyncHandler(async (req, res) => {
  res.json(await getCopilot(req.params.id, req.query.refresh === '1'));
}));

conversationsRouter.post('/:id/copilot/approve', asyncHandler(async (req, res) => {
  await ops.approveCopilot(req.params.id, supervisorOf(req));
  res.json(full(req.params.id));
}));

conversationsRouter.post('/:id/escalate-policy', (req, res) => {
  ops.escalatePolicy(req.params.id, supervisorOf(req));
  res.json(full(req.params.id));
});
