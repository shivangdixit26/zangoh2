import { z } from 'zod';
import { config as appConfig } from '../config.ts';
import { emit } from '../events.ts';
import { HttpError } from '../lib/http.ts';
import { uid } from '../lib/util.ts';
import { store } from '../store.ts';
import type { AgentConfig, Preset } from '../types.ts';
import { addFeed } from './feed.ts';

const unit = z.number().min(0).max(1);

export const agentConfigSchema = z.object({
  parameters: z.object({
    temperature: unit,
    maxTokens: z.number().int().min(32).max(1024),
    responseSpeed: unit,
    empathy: unit,
    stability: unit,
  }),
  capabilities: z.object({
    refunds: z.boolean(),
    orderLookup: z.boolean(),
    knowledgeBase: z.boolean(),
    autoEscalate: z.boolean(),
    accountChanges: z.boolean(),
    proactiveCredits: z.boolean(),
    multilingual: z.boolean(),
  }),
  knowledge: z.record(z.string(), z.boolean()),
  escalation: z.object({
    noAgentResponseSec: z.number().int().min(15).max(900),
    sentimentThreshold: z.number().min(-1).max(0),
    refundValueThreshold: z.number().int().min(0).max(1_000_000),
    confidenceThreshold: unit,
  }),
});

export const FIELD_LABELS: Record<string, string> = {
  'parameters.temperature': 'Creativity (temperature)',
  'parameters.maxTokens': 'Max tokens',
  'parameters.responseSpeed': 'Response speed',
  'parameters.empathy': 'Empathy',
  'parameters.stability': 'Stability',
  'capabilities.refunds': 'Issue refunds',
  'capabilities.orderLookup': 'Order lookup',
  'capabilities.knowledgeBase': 'Knowledge base retrieval',
  'capabilities.autoEscalate': 'Auto-escalate to supervisors',
  'capabilities.accountChanges': 'Account changes',
  'capabilities.proactiveCredits': 'Proactive credits',
  'capabilities.multilingual': 'Multilingual replies',
  'escalation.noAgentResponseSec': 'No agent response',
  'escalation.sentimentThreshold': 'Customer sentiment',
  'escalation.refundValueThreshold': 'Refund value',
  'escalation.confidenceThreshold': 'Confidence score',
};

export interface ConfigChange { path: string; label: string; from: unknown; to: unknown }

export function diffConfig(from: AgentConfig, to: AgentConfig): ConfigChange[] {
  const changes: ConfigChange[] = [];
  for (const section of ['parameters', 'capabilities', 'knowledge', 'escalation'] as const) {
    const a = from[section] as Record<string, unknown>;
    const b = to[section] as Record<string, unknown>;
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[key] !== b[key]) {
        const path = `${section}.${key}`;
        changes.push({ path, label: FIELD_LABELS[path] ?? `Knowledge: ${key}`, from: a[key], to: b[key] });
      }
    }
  }
  return changes;
}

/** Governance risk of a change set: loosening safety rails is riskier than tuning tone. */
export function assessRisk(changes: ConfigChange[], next: AgentConfig): { level: 'Low' | 'Moderate' | 'High'; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  for (const c of changes) {
    if (c.path === 'capabilities.autoEscalate' && c.to === false) { score += 3; reasons.push('auto-escalation disabled'); }
    if (c.path === 'capabilities.refunds' && c.to === true) { score += 1; reasons.push('refund authority enabled'); }
    if (c.path === 'escalation.refundValueThreshold' && Number(c.to) > Number(c.from)) { score += 1; reasons.push('higher autonomous refund limit'); }
    if (c.path === 'escalation.sentimentThreshold' && Number(c.to) < Number(c.from)) { score += 1; reasons.push('escalates later on negative sentiment'); }
    if (c.path === 'escalation.confidenceThreshold' && Number(c.to) < Number(c.from)) { score += 1; reasons.push('accepts lower-confidence answers'); }
    if (c.path === 'parameters.temperature' && Math.abs(Number(c.to) - Number(c.from)) > 0.2) { score += 1; reasons.push('large creativity change'); }
    if (c.path === 'capabilities.knowledgeBase' && c.to === false) { score += 2; reasons.push('knowledge grounding disabled'); }
  }
  if (next.capabilities.refunds && next.escalation.refundValueThreshold > appConfig.policyRefundLimit) { score += 2; reasons.push(`refund limit above policy (₹${appConfig.policyRefundLimit.toLocaleString('en-IN')})`); }
  return { level: score >= 4 ? 'High' : score >= 1 ? 'Moderate' : 'Low', reasons: [...new Set(reasons)] };
}

export function describeDraft(agentId: string) {
  const agent = store.agent(agentId);
  const draft = store.state.drafts[agentId] ?? null;
  if (!draft) return null;
  const changes = diffConfig(agent.config, draft.config);
  return { ...draft, changes, risk: assessRisk(changes, draft.config) };
}

export function saveDraft(agentId: string, next: AgentConfig, supervisor: string) {
  const agent = store.agent(agentId);
  const changes = diffConfig(agent.config, next);
  if (!changes.length) {
    delete store.state.drafts[agentId];
  } else {
    const existing = store.state.drafts[agentId];
    store.state.drafts[agentId] = {
      config: next,
      updatedAt: Date.now(),
      updatedBy: supervisor,
      changeRequest: existing?.changeRequest ?? `CR-${++store.state.counters.changeRequest}`,
    };
  }
  store.save();
  emit.agent(agentId);
  return describeDraft(agentId);
}

export function discardDraft(agentId: string) {
  store.agent(agentId);
  delete store.state.drafts[agentId];
  store.save();
  emit.agent(agentId);
}

function bumpVersion(v: string): string {
  const [major, minor = '0'] = v.split('.');
  return `${major}.${Number(minor) + 1}`;
}

export function deploy(agentId: string, supervisor: string) {
  const agent = store.agent(agentId);
  const draft = store.state.drafts[agentId];
  if (!draft) throw new HttpError(400, 'There are no draft changes to deploy');
  const changes = diffConfig(agent.config, draft.config);
  agent.previous = { version: agent.version, config: agent.config };
  agent.version = bumpVersion(agent.version);
  agent.config = draft.config;
  agent.deployedAt = Date.now();
  if (draft.evals) agent.evals = { ...draft.evals, configVersion: `v${agent.version}` };
  for (const r of agent.routing) if (r.model === `v${agent.previous.version}`) r.model = `v${agent.version}`;
  delete store.state.drafts[agentId];
  store.save();
  emit.agent(agentId);
  addFeed('deploy', 'Agent version routed', `${agent.name} v${agent.version} • 100% traffic • ${changes.length} change${changes.length === 1 ? '' : 's'} by ${supervisor.split(' ')[0]}`, 'info');
  return { agent, changes };
}

export function createPreset(input: { name: string; description: string; config: AgentConfig }, supervisor: string): Preset {
  const name = input.name.trim();
  if (store.state.presets.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, `A preset named "${name}" already exists`);
  const preset: Preset = { id: uid('preset'), name, description: input.description.trim(), builtIn: false, config: input.config, createdBy: supervisor, createdAt: Date.now() };
  store.state.presets.push(preset);
  store.save();
  emit.presets();
  addFeed('preset', 'Preset saved', `${name} • by ${supervisor.split(' ')[0]}`, 'success');
  return preset;
}

export function deletePreset(id: string): void {
  const preset = store.state.presets.find((p) => p.id === id);
  if (!preset) throw new HttpError(404, 'Preset not found');
  if (preset.builtIn) throw new HttpError(403, 'Built-in presets cannot be deleted');
  store.state.presets = store.state.presets.filter((p) => p.id !== id);
  store.save();
  emit.presets();
}
