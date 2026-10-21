import { emit } from '../events.ts';
import { uid } from '../lib/util.ts';
import { store } from '../store.ts';
import type { Conversation, Message } from '../types.ts';
import { addFeed } from './feed.ts';
import { computeRisk, priorityFor } from './risk.ts';

/** Recompute derived fields (risk, priority) after any change. Returns true if they changed. */
export function refresh(conv: Conversation, now = Date.now()): boolean {
  const agent = store.state.agents.find((a) => a.id === conv.agentId);
  if (!agent) return false;
  const risk = computeRisk(conv, agent.config, now);
  const priority = conv.status === 'resolved' ? 'normal' : priorityFor(risk);
  const changed = risk !== conv.risk || priority !== conv.priority;
  conv.risk = risk;
  conv.priority = priority;
  conv.diagnostics.negativeSentiment = Math.max(0, Math.min(1, Number((-conv.sentiment * 1.1 + 0.1).toFixed(2))));
  return changed;
}

export function publish(conv: Conversation): void {
  refresh(conv);
  emit.conversation(conv);
  emit.metricsChanged();
  store.save();
}

export function appendMessage(conv: Conversation, msg: Omit<Message, 'id' | 'ts'> & { ts?: number }): Message {
  const message: Message = { id: uid('m'), ts: msg.ts ?? Date.now(), ...msg };
  conv.messages.push(message);
  if ((message.role === 'ai' || message.role === 'supervisor') && !conv.firstResponseAt) conv.firstResponseAt = message.ts;
  if (message.role === 'customer') conv.copilot = null; // new information invalidates the cached recommendation
  emit.message(conv.id, message);
  publish(conv);
  return message;
}

const REASON_LABELS: Record<string, string> = {
  refund_value: 'refund above autonomous limit',
  sentiment: 'customer sentiment below threshold',
  confidence: 'AI confidence below threshold',
  no_response: 'no agent response within threshold',
  customer_request: 'customer asked for a human',
  sla: 'SLA breach likely',
};

export function escalate(conv: Conversation, reason: string): void {
  if (conv.status !== 'active' || conv.control !== 'ai') return;
  conv.status = 'escalated';
  const label = REASON_LABELS[reason] ?? reason;
  appendMessage(conv, { role: 'system', text: `AI escalated to the supervisor queue: ${label}.` });
  addFeed('escalated', 'AI escalated', `${conv.customer.name.split(' ')[0]} #${conv.caseNumber} • ${label}`, 'warning', conv.id);
}
