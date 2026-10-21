import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse, supervisorOf } from '../lib/http.ts';
import { store } from '../store.ts';
import { agentConfigSchema, createPreset, deletePreset, deploy, describeDraft, discardDraft, saveDraft } from '../services/agentConfig.ts';
import { SUITE, runEvals, simulate } from '../services/agentRuntime.ts';
import { agentPerformance } from '../services/metrics.ts';

export const agentsRouter = Router();
export const presetsRouter = Router();

agentsRouter.get('/', (_req, res) => {
  res.json({
    items: store.state.agents.map((a) => ({
      id: a.id, name: a.name, description: a.description, queue: a.queue, version: a.version, deployedAt: a.deployedAt,
      hasDraft: Boolean(store.state.drafts[a.id]),
      activeConversations: store.activeConversations().filter((c) => c.agentId === a.id).length,
    })),
  });
});

agentsRouter.get('/:id', (req, res) => {
  const agent = store.agent(req.params.id);
  const draft = describeDraft(agent.id);
  const evals = draft?.evals ?? agent.evals;
  res.json({
    agent,
    draft,
    performance: agentPerformance(agent.id),
    evals: { ...evals, suite: SUITE.map(({ key, label }) => ({ key, label, score: evals.results[key] })) },
  });
});

agentsRouter.put('/:id/draft', (req, res) => {
  const body = parse(z.object({ config: agentConfigSchema }), req.body ?? {});
  res.json({ draft: saveDraft(req.params.id, body.config, supervisorOf(req)) });
});

agentsRouter.delete('/:id/draft', (req, res) => {
  discardDraft(req.params.id);
  res.json({ ok: true });
});

agentsRouter.post('/:id/deploy', (req, res) => {
  const { agent, changes } = deploy(req.params.id, supervisorOf(req));
  res.json({ version: agent.version, changes });
});

const target = z.enum(['draft', 'deployed', 'previous']).default('draft');

agentsRouter.post('/:id/simulate', asyncHandler(async (req, res) => {
  const body = parse(z.object({ index: z.number().int().min(0).default(0), target }), req.body ?? {});
  res.json(await simulate(req.params.id, body.index, body.target));
}));

agentsRouter.post('/:id/evals', asyncHandler(async (req, res) => {
  const body = parse(z.object({ target }), req.body ?? {});
  res.json(await runEvals(req.params.id, body.target));
}));

presetsRouter.get('/', (_req, res) => {
  res.json({ items: store.state.presets });
});

presetsRouter.post('/', (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(1, 'Name is required').max(60), description: z.string().max(200).default(''), config: agentConfigSchema }), req.body ?? {});
  res.status(201).json(createPreset(body, supervisorOf(req)));
});

presetsRouter.delete('/:id', (req, res) => {
  deletePreset(req.params.id);
  res.json({ ok: true });
});
