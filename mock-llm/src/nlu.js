// Lightweight, deterministic "understanding" layer for the mock LLM.
// Everything here is keyword/lexicon based so responses are reproducible in demos and tests.

const INTENTS = [
  { id: 'injection', weight: 5, patterns: [/ignore (all|any|previous|prior|your)/, /system prompt/, /you are now/, /disregard (the|your|all) (rules|policy|policies|instructions)/, /developer mode/, /pretend (you|to be)/] },
  { id: 'human', weight: 3, patterns: [/\bhuman\b/, /real person/, /\bmanager\b/, /\bsupervisor\b/, /speak to (someone|a person)/] },
  { id: 'refund', weight: 2, patterns: [/refund/, /money back/, /reimburse/, /\breturn(ed|ing)?\b/, /store credit/, /return label/] },
  { id: 'delivery', weight: 2, patterns: [/deliver/, /package/, /parcel/, /shipment/, /shipping/, /tracking/, /courier/, /hasn'?t arrived/, /not arrived/, /where is my order/, /\bexpress\b/, /\bsms\b/, /\barriv/, /at my door/] },
  { id: 'account', weight: 2, patterns: [/account/, /log ?in/, /password/, /locked/, /2fa|two.factor|otp|verification code/, /sign ?in/, /\bthe code\b/, /email address/, /\bverif/] },
  { id: 'product', weight: 2, patterns: [/broken/, /defect/, /not working/, /stopped working/, /damaged/, /faulty/, /cracked/, /replacement/, /warranty/, /won'?t turn on/] },
  { id: 'billing', weight: 2, patterns: [/charge/, /invoice/, /\bbill/, /subscription/, /payment/, /double/, /overcharg/, /renew/] },
  { id: 'cancel', weight: 2, patterns: [/cancel/, /close my account/, /unsubscribe/] },
  { id: 'thanks', weight: 1, patterns: [/thank/, /\bthanks\b/, /appreciate/, /that'?s all/, /perfect/, /great,? (thanks|thank)/] },
  { id: 'greeting', weight: 1, patterns: [/^(hi|hello|hey|good (morning|afternoon|evening))\b/] },
];

const NEGATIVE = {
  still: 1, again: 1, never: 1, angry: 2, frustrated: 2, frustrating: 2, terrible: 2, worst: 2, ridiculous: 2,
  unacceptable: 2, waiting: 1, blocked: 1, broken: 1, useless: 2, disappointed: 2, annoyed: 2, upset: 2,
  scam: 3, lawyer: 3, complaint: 2, cancel: 1, late: 1, delayed: 1, nobody: 1, "can't": 1, cannot: 1, "won't": 1,
  "didn't": 1, wrong: 1, problem: 1, issue: 0.5, locked: 1, damaged: 1, missing: 1, lost: 1, charged: 0.5,
};
const POSITIVE = {
  thanks: 2, thank: 2, great: 2, perfect: 2, appreciate: 2, happy: 2, awesome: 2, resolved: 1, works: 1,
  helpful: 2, amazing: 2, excellent: 2, good: 1, love: 2, fine: 1, ok: 0.5, okay: 0.5,
};
const URGENCY = [/\btoday\b/, /right now/, /immediately/, /asap/, /urgent/, /second time/, /third time/, /again/];

export function normalize(text) {
  return String(text || '').toLowerCase().replace(/[’']/g, "'");
}

export function detectIntent(text) {
  const t = normalize(text);
  const scores = INTENTS.map((intent) => {
    const hits = intent.patterns.reduce((n, p) => n + (p.test(t) ? 1 : 0), 0);
    return { id: intent.id, score: hits * intent.weight };
  }).filter((s) => s.score > 0);

  if (!scores.length) return { intent: 'fallback', score: 0.35 };
  scores.sort((a, b) => b.score - a.score);
  const top = scores[0];
  const total = scores.reduce((n, s) => n + s.score, 0);
  // Confidence in the intent: how dominant the top intent is, floored so a single clear hit still reads as confident.
  const score = Math.min(0.99, 0.6 + 0.4 * (top.score / total) * Math.min(1, top.score / 2));
  return { intent: top.id, score: Number(score.toFixed(2)) };
}

export function analyzeSentiment(text) {
  const t = normalize(text);
  const words = t.match(/[a-z']+/g) || [];
  let neg = 0;
  let pos = 0;
  for (const w of words) {
    if (NEGATIVE[w]) neg += NEGATIVE[w];
    if (POSITIVE[w]) pos += POSITIVE[w];
  }
  const urgent = URGENCY.some((p) => p.test(t));
  if (urgent) neg += 1.5;
  if (/!{2,}/.test(t)) neg += 1;
  if (/\bnot (happy|good|ok|okay|fine)\b/.test(t)) { neg += 2; pos = Math.max(0, pos - 2); }

  const raw = (pos - neg) / Math.max(2.5, (pos + neg) * 0.9);
  const score = Math.max(-1, Math.min(1, Number(raw.toFixed(2))));
  let label = 'neutral';
  if (score <= -0.5) label = urgent ? 'urgent_negative' : 'negative';
  else if (score < -0.1) label = 'negative';
  else if (score >= 0.3) label = 'positive';
  return { score, label, urgent };
}

export function extractAmount(text) {
  const t = String(text || '');
  const m = t.match(/(?:₹|rs\.?|inr|\$|usd|eur|€)\s?([\d,]+(?:\.\d+)?)/i) || t.match(/([\d,]{3,}(?:\.\d+)?)\s?(?:rupees|inr|dollars|usd)/i);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

export function lastUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') return messages[i].content || '';
  }
  return '';
}

export function estimateTokens(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}
