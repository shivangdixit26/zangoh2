import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessRisk, diffConfig } from '../src/services/agentConfig.ts';
import { evaluateAggregate, evaluateConversation } from '../src/services/alerts.ts';
import { computeRisk, priorityFor, recommendedAction } from '../src/services/risk.ts';
import { canEdit, canSee, extractVariables, validateContent, view } from '../src/services/templates.ts';
import type { Agent, AgentConfig, Conversation, Template } from '../src/types.ts';

const NOW = 1_800_000_000_000;
const MIN = 60_000;

const cfg: AgentConfig = {
  parameters: { temperature: 0.6, maxTokens: 320, responseSpeed: 0.6, empathy: 0.8, stability: 0.8 },
  capabilities: { refunds: true, orderLookup: true, knowledgeBase: true, autoEscalate: true, accountChanges: false, proactiveCredits: false, multilingual: true },
  knowledge: { returns: true },
  escalation: { noAgentResponseSec: 90, sentimentThreshold: -0.55, refundValueThreshold: 5000, confidenceThreshold: 0.64 },
};

function conv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c-1', caseNumber: '1', topic: 'Refund', queue: 'Refund', channel: 'Web chat', agentId: 'csr-returns',
    customer: { id: 'x', name: 'Test User', tier: 'Standard', tenureYears: 1, location: 'X', region: 'Europe', language: 'EN', lifetimeValue: 1, orders: 1, returnRate: 0 },
    status: 'active', control: 'ai', startedAt: NOW - 5 * MIN, slaDueAt: NOW + 15 * MIN, sentiment: 0, aiConfidence: 0.9, risk: 0, priority: 'normal',
    diagnostics: { repeatContact: 0, negativeSentiment: 0, policyException: 0, churnPropensity: 0 }, evidence: [], feedbackNotes: '', handoffNotes: [],
    messages: [{ id: 'm1', role: 'customer', text: 'hi', ts: NOW - 4 * MIN }, { id: 'm2', role: 'ai', text: 'hello', ts: NOW - 4 * MIN + 5000 }],
    ...overrides,
  };
}

test('risk grows with negative sentiment and SLA pressure', () => {
  const calm = computeRisk(conv(), cfg, NOW);
  const hot = computeRisk(conv({ sentiment: -0.8, slaDueAt: NOW + 1 * MIN, aiConfidence: 0.5, status: 'escalated' }), cfg, NOW);
  assert.ok(calm < 30, `calm risk ${calm}`);
  assert.ok(hot >= 85, `hot risk ${hot}`);
  assert.equal(priorityFor(hot), 'critical');
  assert.equal(computeRisk(conv({ status: 'resolved' }), cfg, NOW), 0);
});

test('recommended action follows priority and context', () => {
  assert.equal(recommendedAction(conv({ priority: 'critical', risk: 95 }), cfg), 'take_over');
  assert.equal(recommendedAction(conv({ refundAmount: 9000, risk: 60, priority: 'watch' }), cfg), 'approve_override');
  assert.equal(recommendedAction(conv({ control: 'supervisor' }), cfg), 'monitor');
});

test('conversation rules use the agent escalation thresholds', () => {
  const rules = (c: Conversation, policy = cfg) => evaluateConversation(c, policy, NOW).map((a) => a.rule).sort();
  assert.deepEqual(rules(conv()), []);
  assert.deepEqual(rules(conv({ sentiment: -0.6 })), ['sentiment']);
  assert.deepEqual(rules(conv({ sentiment: -0.6 }), { ...cfg, escalation: { ...cfg.escalation, sentimentThreshold: -0.8 } }), []);
  assert.deepEqual(rules(conv({ aiConfidence: 0.5 })), ['confidence']);
  assert.deepEqual(rules(conv({ aiConfidence: 0.5, control: 'supervisor' })), [], 'confidence only matters while the AI is in control');
  assert.deepEqual(rules(conv({ refundAmount: 8420 })), ['refund_value']);
  assert.deepEqual(rules(conv({ slaDueAt: NOW + 3 * MIN })), ['sla']);
  assert.equal(evaluateConversation(conv({ slaDueAt: NOW - MIN }), cfg, NOW)[0].title, 'SLA breached');
});

test('no-response rule fires after the configured wait and turns critical at 2x', () => {
  const waiting = (sec: number) => conv({ messages: [{ id: 'm', role: 'customer', text: 'hello?', ts: NOW - sec * 1000 }] });
  assert.equal(evaluateConversation(waiting(60), cfg, NOW).length, 0);
  assert.equal(evaluateConversation(waiting(100), cfg, NOW)[0].severity, 'warning');
  assert.equal(evaluateConversation(waiting(200), cfg, NOW)[0].severity, 'critical');
});

test('aggregate signals detect clusters, regional anomalies and degraded agents', () => {
  const active = [
    conv({ id: 'a', slaDueAt: NOW + 4 * MIN, sentiment: -0.5 }),
    conv({ id: 'b', slaDueAt: NOW + 6 * MIN, sentiment: -0.4 }),
  ];
  const agent = { id: 'csr-x', name: 'CSR-X', version: '1.0', stats: { fallbackRate: 0.24 } } as unknown as Agent;
  const keys = evaluateAggregate(active, [agent], NOW).map((a) => a.key).sort();
  assert.deepEqual(keys, ['agent_degradation:csr-x', 'sentiment_anomaly:Europe', 'sla_cluster:Refund']);
});

test('config diff and governance risk', () => {
  const next: AgentConfig = { ...cfg, capabilities: { ...cfg.capabilities, autoEscalate: false }, escalation: { ...cfg.escalation, refundValueThreshold: 9000 } };
  const changes = diffConfig(cfg, next);
  assert.deepEqual(changes.map((c) => c.path).sort(), ['capabilities.autoEscalate', 'escalation.refundValueThreshold']);
  const risk = assessRisk(changes, next);
  assert.equal(risk.level, 'High');
  assert.equal(assessRisk(diffConfig(cfg, { ...cfg, parameters: { ...cfg.parameters, empathy: 0.9 } }), cfg).level, 'Low');
});

test('template sharing: private templates are visible and editable only by their author', () => {
  const t = { id: 't', name: 'x', title: '', category: 'Shipping', type: 'Chat', channels: ['Website'], content: 'hi', cta: null, favoriteBy: ['Neha Prasad'], uses: 0, lastUsedAt: null, shared: false, createdBy: 'Neha Prasad', createdAt: 0, updatedAt: 0 } as Template;
  assert.equal(canSee(t, 'Neha Prasad'), true);
  assert.equal(canSee(t, 'Rahul Mehta'), false);
  assert.equal(canSee({ ...t, shared: true }, 'Rahul Mehta'), true);
  assert.equal(canEdit({ ...t, shared: true }, 'Rahul Mehta'), false, 'sharing grants use, not edit');
  assert.equal(view(t, 'Neha Prasad').favorite, true);
  assert.equal(view({ ...t, shared: true }, 'Rahul Mehta').favorite, false, 'favourites are personal');
});

test('template variable validation', () => {
  assert.deepEqual(validateContent('Hi {{user_name}}, case {{case_id}}'), []);
  assert.equal(validateContent('Hi {{User Name}}').length, 1);
  assert.equal(validateContent('Hi {{user_name}').length, 1);
  assert.deepEqual(extractVariables('Hi {{user_name}} and {{ user_name }} at {{company_name}}'), ['user_name', 'company_name']);
});
