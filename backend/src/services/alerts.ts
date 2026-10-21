import { emit } from '../events.ts';
import { HttpError } from '../lib/http.ts';
import { MINUTE, formatMoney, uid } from '../lib/util.ts';
import { store } from '../store.ts';
import type { Agent, AgentConfig, Alert, AlertRule, Conversation, Severity } from '../types.ts';
import { escalate } from './convOps.ts';
import { addFeed } from './feed.ts';

export interface TriggeredAlert {
  key: string;
  rule: AlertRule;
  severity: Severity;
  title: string;
  detail: string;
  conversationId?: string | null;
  queue?: string | null;
  agentId?: string | null;
}

const signed = (n: number) => (n < 0 ? `−${Math.abs(n).toFixed(2)}` : n.toFixed(2));

export function waitingSince(conv: Conversation): number | null {
  let since: number | null = null;
  for (let i = conv.messages.length - 1; i >= 0; i -= 1) {
    const m = conv.messages[i];
    if (m.role === 'customer') since = m.ts;
    else if (m.role === 'ai' || m.role === 'supervisor') break;
  }
  return since;
}

/** Per-conversation rules, driven by the owning agent's escalation policy. Pure: easy to unit test. */
export function evaluateConversation(conv: Conversation, cfg: AgentConfig, now: number): TriggeredAlert[] {
  if (conv.status === 'resolved') return [];
  const who = `${conv.customer.name} · #${conv.caseNumber}`;
  const base = { conversationId: conv.id, queue: conv.queue, agentId: conv.agentId };
  const out: TriggeredAlert[] = [];
  const { escalation } = cfg;

  const slaLeft = conv.slaDueAt - now;
  if (slaLeft <= 5 * MINUTE) {
    out.push({ ...base, key: `sla:${conv.id}`, rule: 'sla', severity: 'critical', title: slaLeft <= 0 ? 'SLA breached' : 'SLA breach likely', detail: `${conv.queue} queue • ${who}` });
  }
  if (conv.sentiment <= escalation.sentimentThreshold) {
    out.push({ ...base, key: `sentiment:${conv.id}`, rule: 'sentiment', severity: 'critical', title: 'Negative sentiment', detail: `${signed(conv.sentiment)} ≤ ${signed(escalation.sentimentThreshold)} • ${who}` });
  }
  if (conv.control === 'ai' && conv.aiConfidence <= escalation.confidenceThreshold) {
    out.push({ ...base, key: `confidence:${conv.id}`, rule: 'confidence', severity: 'warning', title: 'Low AI confidence', detail: `${conv.aiConfidence.toFixed(2)} ≤ ${escalation.confidenceThreshold.toFixed(2)} • ${who}` });
  }
  if (conv.refundAmount != null && escalation.refundValueThreshold > 0 && conv.refundAmount >= escalation.refundValueThreshold) {
    out.push({ ...base, key: `refund_value:${conv.id}`, rule: 'refund_value', severity: 'warning', title: 'Refund above autonomous limit', detail: `${formatMoney(conv.refundAmount)} ≥ ${formatMoney(escalation.refundValueThreshold)} • ${who}` });
  }
  const since = waitingSince(conv);
  if (since != null) {
    const waitedSec = (now - since) / 1000;
    if (waitedSec > escalation.noAgentResponseSec) {
      out.push({
        ...base, key: `no_response:${conv.id}`, rule: 'no_response', severity: waitedSec > escalation.noAgentResponseSec * 2 ? 'critical' : 'warning',
        title: 'No agent response', detail: `Waiting > ${escalation.noAgentResponseSec}s • ${who}`,
      });
    }
  }
  return out;
}

/** Fleet-level signals shown in "Critical signals". */
export function evaluateAggregate(active: Conversation[], agents: Agent[], now: number): TriggeredAlert[] {
  const out: TriggeredAlert[] = [];
  const byQueue = new Map<string, number>();
  for (const c of active) if (c.slaDueAt - now < 10 * MINUTE) byQueue.set(c.queue, (byQueue.get(c.queue) ?? 0) + 1);
  for (const [queue, n] of byQueue) {
    if (n >= 2) out.push({ key: `sla_cluster:${queue}`, rule: 'sla_cluster', severity: 'critical', title: 'SLA breach cluster', detail: `${queue} queue • ${n} conversations`, queue });
  }
  const byRegion = new Map<string, number[]>();
  for (const c of active) byRegion.set(c.customer.region, [...(byRegion.get(c.customer.region) ?? []), c.sentiment]);
  for (const [region, values] of byRegion) {
    const avg = values.reduce((n, v) => n + v, 0) / values.length;
    if (values.length >= 2 && avg <= -0.35) {
      out.push({ key: `sentiment_anomaly:${region}`, rule: 'sentiment_anomaly', severity: 'warning', title: 'Sentiment anomaly', detail: `${region} • avg ${signed(avg)} across ${values.length} chats` });
    }
  }
  for (const a of agents) {
    if (a.stats.fallbackRate >= 0.2) {
      out.push({ key: `agent_degradation:${a.id}`, rule: 'agent_degradation', severity: 'warning', title: 'Agent degradation', detail: `${a.name} v${a.version} • Fallback rate ${Math.round(a.stats.fallbackRate * 100)}%`, agentId: a.id });
    }
  }
  return out;
}

const AUTO_ESCALATE_RULES: AlertRule[] = ['sentiment', 'confidence', 'refund_value', 'no_response'];

/** Reconcile open alerts with what the rules say right now: raise new ones, update changed ones, clear resolved ones. */
export function syncAlerts(now = Date.now()): Alert[] {
  const { state } = store;
  const active = store.activeConversations();
  const agents = new Map(state.agents.map((a) => [a.id, a]));
  const triggered = [
    ...active.flatMap((c) => evaluateConversation(c, agents.get(c.agentId)!.config, now)),
    ...evaluateAggregate(active, state.agents, now),
  ];
  const pending = new Map(triggered.map((t) => [t.key, t]));
  const raised: Alert[] = [];

  for (const alert of state.alerts) {
    if (alert.status === 'cleared') continue;
    const t = pending.get(alert.key);
    if (!t) {
      alert.status = 'cleared';
      alert.updatedAt = now;
      emit.alert(alert);
      continue;
    }
    pending.delete(alert.key);
    if (t.title !== alert.title || t.severity !== alert.severity) {
      const escalated = t.severity === 'critical' && alert.severity !== 'critical';
      Object.assign(alert, { title: t.title, severity: t.severity, detail: t.detail, updatedAt: now });
      if (escalated && alert.status === 'acknowledged') alert.status = 'open';
      emit.alert(alert);
    }
  }

  for (const t of pending.values()) {
    const alert: Alert = { id: uid('a'), status: 'open', createdAt: now, updatedAt: now, acknowledgedBy: null, conversationId: null, queue: null, agentId: null, ...t };
    state.alerts.push(alert);
    raised.push(alert);
    emit.alert(alert);
    if (t.rule === 'sla_cluster' || t.rule === 'sla') addFeed('alert', 'SLA alert raised', t.detail, 'info', t.conversationId ?? null);
    const conv = t.conversationId ? active.find((c) => c.id === t.conversationId) : undefined;
    if (conv && AUTO_ESCALATE_RULES.includes(t.rule) && agents.get(conv.agentId)?.config.capabilities.autoEscalate) {
      escalate(conv, t.rule);
    }
  }

  // Keep the list bounded: drop cleared alerts after an hour.
  state.alerts = state.alerts.filter((a) => a.status !== 'cleared' || now - a.updatedAt < 60 * MINUTE).slice(-400);
  if (raised.length) store.save();
  return raised;
}

export function acknowledge(id: string, supervisor: string): Alert {
  const alert = store.state.alerts.find((a) => a.id === id);
  if (!alert) throw new HttpError(404, 'Alert not found');
  if (alert.status === 'open') {
    alert.status = 'acknowledged';
    alert.acknowledgedBy = supervisor;
    alert.updatedAt = Date.now();
    emit.alert(alert);
    store.save();
  }
  return alert;
}
