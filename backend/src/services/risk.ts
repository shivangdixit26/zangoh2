import { MINUTE, clamp } from '../lib/util.ts';
import type { AgentConfig, Conversation, Priority, RecommendedAction } from '../types.ts';

/**
 * Breach-risk score (0–99). Each factor is treated as an independent probability of the conversation
 * going wrong; the score is the chance that at least one does: 1 − Π(1 − weight·factor).
 */
export function computeRisk(conv: Conversation, cfg: AgentConfig, now: number): number {
  if (conv.status === 'resolved') return 0;
  const slaLeftMin = (conv.slaDueAt - now) / MINUTE;
  const factors: [number, number][] = [
    [0.55, clamp(-conv.sentiment, 0, 1)],
    [0.6, slaLeftMin <= 0 ? 1 : clamp(1 - slaLeftMin / 15, 0, 1)],
    [0.4, conv.control === 'ai' ? clamp((0.85 - conv.aiConfidence) / 0.5, 0, 1) : 0],
    [0.35, conv.diagnostics.repeatContact],
    [0.3, conv.refundAmount != null && conv.refundAmount > cfg.escalation.refundValueThreshold ? 1 : 0],
    [0.1, conv.customer.tier === 'VIP' ? 1 : 0],
    [0.25, conv.status === 'escalated' ? 1 : 0],
  ];
  const ok = factors.reduce((p, [w, f]) => p * (1 - w * f), 1);
  return Math.round(clamp(100 * (1 - ok), 0, 99));
}

export function priorityFor(risk: number): Priority {
  if (risk >= 85) return 'critical';
  if (risk >= 65) return 'high';
  if (risk >= 45) return 'watch';
  return 'normal';
}

export function recommendedAction(conv: Conversation, cfg: AgentConfig): RecommendedAction {
  if (conv.status === 'resolved') return 'none';
  if (conv.control === 'supervisor') return 'monitor';
  if (conv.priority === 'critical') return 'take_over';
  if ((conv.refundAmount != null && conv.refundAmount > cfg.escalation.refundValueThreshold) || (conv.queue === 'Account' && conv.risk >= 65)) {
    return 'approve_override';
  }
  if ((conv.queue === 'Delivery' || conv.queue === 'Product') && conv.risk >= 60) return 'review_evidence';
  if (conv.status === 'escalated' || conv.priority === 'high') return 'take_over';
  if (conv.queue === 'Billing' || conv.risk < 45) return 'send_template';
  return 'monitor';
}
