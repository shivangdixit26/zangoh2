import { HttpError } from '../lib/http.ts';
import { shortName } from '../lib/util.ts';
import { store } from '../store.ts';
import type { Conversation } from '../types.ts';
import { getCopilot, resolveConversation, resumeAfterHandoff } from './agentRuntime.ts';
import { syncAlerts } from './alerts.ts';
import { appendMessage, publish } from './convOps.ts';
import { addFeed } from './feed.ts';
import { recordUse } from './templates.ts';

const UNRESOLVED_VAR = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

function assertOpen(conv: Conversation) {
  if (conv.status === 'resolved') throw new HttpError(409, 'Conversation is already resolved');
}

function assertController(conv: Conversation, supervisor: string) {
  if (conv.control !== 'supervisor') throw new HttpError(409, 'Take over the conversation before acting as supervisor');
  if (conv.supervisor !== supervisor) throw new HttpError(409, `${conv.supervisor} is currently handling this conversation`);
}

export function takeOver(id: string, supervisor: string): Conversation {
  const conv = store.conversation(id);
  assertOpen(conv);
  if (conv.control === 'supervisor') {
    if (conv.supervisor === supervisor) return conv;
    throw new HttpError(409, `${conv.supervisor} is already handling this conversation`);
  }
  conv.control = 'supervisor';
  conv.supervisor = supervisor;
  conv.takenOverAt = Date.now();
  conv.status = 'active';
  appendMessage(conv, { role: 'system', text: `${supervisor} took over from the AI agent. The AI is paused.` });
  addFeed('takeover', 'Takeover approved', `${shortName(conv.customer.name)} • by ${shortName(supervisor)}`, 'critical', conv.id);
  syncAlerts();
  return conv;
}

export type MessageSource = 'typed' | 'voice' | 'template' | 'copilot';

export function sendSupervisorMessage(id: string, supervisor: string, text: string, template?: { id: string } | null, source: MessageSource = 'typed'): Conversation {
  const conv = store.conversation(id);
  assertOpen(conv);
  assertController(conv, supervisor);
  const unresolved = [...text.matchAll(UNRESOLVED_VAR)].map((m) => m[1]);
  if (unresolved.length) {
    throw new HttpError(422, `Fill in template variables before sending: ${[...new Set(unresolved)].join(', ')}`, { unresolved });
  }
  const tpl = template ? recordUse(template.id, supervisor) : undefined;
  appendMessage(conv, {
    role: 'supervisor',
    text: text.trim(),
    author: supervisor,
    meta: { source: tpl && source === 'typed' ? 'template' : source, ...(tpl ? { templateId: tpl.id, templateName: tpl.name, cta: tpl.cta } : {}) },
  });
  if (tpl) addFeed('template', 'Template inserted', `${tpl.name} • ${shortName(conv.customer.name)}`, 'info', conv.id);
  if (source === 'voice') addFeed('voice', 'Voice reply sent', `${shortName(supervisor)} → ${shortName(conv.customer.name)} #${conv.caseNumber}`, 'info', conv.id);
  return conv;
}

export function returnToAi(id: string, supervisor: string, notes: string, shareWithAi: boolean): Conversation {
  const conv = store.conversation(id);
  assertOpen(conv);
  assertController(conv, supervisor);
  const agent = store.agent(conv.agentId);
  const text = notes.trim();
  if (text) {
    conv.handoffNotes.push({ ts: Date.now(), author: supervisor, text, sharedWithAi: shareWithAi });
    appendMessage(conv, { role: 'note', text, author: supervisor, meta: { visibleToCustomer: false } });
  }
  conv.control = 'ai';
  conv.supervisor = null;
  conv.aiConfidence = Math.max(conv.aiConfidence, 0.8); // the supervisor has cleared the blocker
  appendMessage(conv, { role: 'system', text: `${supervisor} returned control to ${agent.name} v${agent.version}${text ? (shareWithAi ? ' with notes shared as context' : ' (notes kept internal)') : ''}.` });
  addFeed('handback', 'Returned to AI', `${shortName(conv.customer.name)} • ${text ? 'with notes' : 'no notes'} • by ${shortName(supervisor)}`, 'info', conv.id);
  void resumeAfterHandoff(conv.id);
  return conv;
}

export function resolve(id: string, supervisor: string, notes?: string): Conversation {
  const conv = store.conversation(id);
  assertOpen(conv);
  if (conv.control === 'supervisor' && conv.supervisor !== supervisor) {
    throw new HttpError(409, `${conv.supervisor} is currently handling this conversation`);
  }
  if (notes !== undefined) conv.feedbackNotes = notes;
  resolveConversation(conv, 'supervisor', supervisor);
  syncAlerts();
  return conv;
}

export function updateFeedbackNotes(id: string, notes: string): Conversation {
  const conv = store.conversation(id);
  conv.feedbackNotes = notes;
  publish(conv);
  return conv;
}

/** Supervisor approves the co-pilot's recommendation; whoever controls the chat delivers the message. */
export async function approveCopilot(id: string, supervisor: string): Promise<Conversation> {
  const conv = store.conversation(id);
  assertOpen(conv);
  const rec = await getCopilot(id);
  const fresh = store.conversation(id);
  if (fresh.control === 'supervisor') {
    assertController(fresh, supervisor);
    appendMessage(fresh, { role: 'supervisor', text: rec.suggestedReply, author: supervisor, meta: { source: 'copilot' } });
  } else {
    const agent = store.agent(fresh.agentId);
    appendMessage(fresh, { role: 'system', text: `${supervisor} approved: ${rec.summary}` });
    appendMessage(fresh, { role: 'ai', text: rec.suggestedReply, author: `${agent.name} v${agent.version}`, meta: { confidence: rec.confidence, intent: 'approved_action' } });
    fresh.status = 'active';
  }
  // The approval removes the blocker that needed a human.
  fresh.refundAmount = rec.action === 'approve_refund' ? null : fresh.refundAmount;
  fresh.diagnostics.policyException = Math.min(fresh.diagnostics.policyException, 0.1);
  fresh.aiConfidence = Math.max(fresh.aiConfidence, rec.confidence);
  fresh.copilot = null;
  addFeed('override', 'Override approved', `${rec.summary.slice(0, 60)} • ${shortName(fresh.customer.name)}`, 'success', fresh.id);
  publish(fresh);
  syncAlerts();
  return fresh;
}

export function escalatePolicy(id: string, supervisor: string): Conversation {
  const conv = store.conversation(id);
  assertOpen(conv);
  const policy = conv.copilot?.policy?.id ?? 'policy';
  appendMessage(conv, { role: 'system', text: `${supervisor} escalated ${policy} exception to Ops Governance for review.` });
  addFeed('policy', 'Policy exception escalated', `${policy} • ${shortName(conv.customer.name)}`, 'warning', conv.id);
  return conv;
}
