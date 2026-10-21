import { analyzeSentiment, detectIntent, estimateTokens, extractAmount, lastUserMessage } from './nlu.js';

// ---------------------------------------------------------------------------
// Seeded randomness so a given (seed, temperature) pair always produces the same text.
// ---------------------------------------------------------------------------
export function createRng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashString(String(seed ?? Date.now()));
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function money(amount, currency = 'INR') {
  if (amount == null) return '';
  if (currency === 'INR') return `₹${Math.round(amount).toLocaleString('en-IN')}`;
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'there';
}

function firstSentence(text) {
  const m = String(text || '').match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : String(text || '')).trim();
}

function pick(list, rng, temperature) {
  if (!list.length) return '';
  // Low temperature: always the canonical (first) phrasing. Higher temperature: increasingly likely to vary.
  if (temperature < 0.15 || rng() > temperature) return list[0];
  return list[Math.floor(rng() * list.length)];
}

// ---------------------------------------------------------------------------
// Reply bodies per intent. Each returns { variants, escalate?, reason? }.
// ---------------------------------------------------------------------------
function bodyFor(intent, ctx) {
  const { caps, amount, limit, orderId, name, company } = ctx;
  switch (intent) {
    case 'refund': {
      if (ctx.wantsLabel) {
        return {
          variants: [
            `I've emailed you a prepaid return label${orderId ? ` for ${orderId}` : ''}. Drop the parcel at any partner location within 14 days and your refund starts as soon as it's scanned.`,
            `Done. A prepaid return label${orderId ? ` for ${orderId}` : ''} is on its way to your inbox. It's valid for 14 days at any partner drop-off point.`,
          ],
        };
      }
      if (amount != null && amount > limit) {
        return {
          variants: [
            "The amount exceeds my approval limit. I've prepared the evidence for supervisor review.",
            `Because ${money(amount, ctx.currency)} is above what I can approve on my own, I've prepared an expedited review for a supervisor.`,
            "This refund is above my approval threshold, so I've packaged the return evidence for a supervisor to sign off.",
          ],
          escalate: true,
          reason: 'refund_value',
        };
      }
      if (!caps.refunds) {
        return {
          variants: [
            "I can see your return in our system. Refund approvals are handled by our returns team, so I've flagged this for them with your order details.",
            "Your return is logged on our side. I'm not able to release refunds myself, so I've routed this to the returns team with everything they need.",
          ],
        };
      }
      if (amount != null) {
        return {
          variants: [
            `I've confirmed your return was received and issued a refund of ${money(amount, ctx.currency)} to your original payment method. It should appear within 3–5 business days.`,
            `Good news: the return scan is in, so I've released your refund of ${money(amount, ctx.currency)}. Expect it on your original payment method within 3–5 business days.`,
          ],
        };
      }
      return {
        variants: [
          "I found the return receipt and carrier confirmation. I'm checking the refund policy now.",
          "I've located your return and the carrier scan. Let me confirm which refund rules apply.",
          "Thanks for waiting. The return is registered on our side and I'm verifying the refund eligibility now.",
        ],
      };
    }
    case 'delivery':
      if (!caps.orderLookup) {
        return {
          variants: [
            "I can't pull live tracking from here, but I've noted your order so our logistics team can check it and update you.",
            "Live tracking isn't available to me right now. I've passed your order to logistics so they can confirm where it is.",
          ],
        };
      }
      return {
        variants: [
          `I've checked tracking for ${orderId || 'your order'}: the courier logged a delivery exception yesterday. I've requested a new delivery attempt and you'll get an SMS with the slot.`,
          `Your parcel${orderId ? ` (${orderId})` : ''} is at the local hub after an address verification hold. I've confirmed the address so it goes out on the next run.`,
          `Tracking shows ${orderId || 'the order'} was delayed at the sorting centre. It's moving again and I've asked the courier to prioritise it.`,
        ],
      };
    case 'account':
      if (ctx.hasCode) {
        return {
          variants: [
            "Thanks, that code checks out. I've updated your account and sent a confirmation to your registered email.",
            "Perfect, the code is verified. Your account details are updated and you'll get a confirmation email shortly.",
          ],
        };
      }
      if (caps.accountChanges) {
        return {
          variants: [
            "For your security I've sent a verification code to the email on file. Once you confirm it, I'll unlock the account right away.",
            "I can unlock this for you. I've just sent a one-time code to your registered email; share it here and you'll be back in.",
          ],
        };
      }
      return {
        variants: [
          "Your account was locked after several failed sign-in attempts. I've started an identity check and you'll get a secure reset link once it's approved.",
          "The lock was triggered by our security system. I've opened an identity verification request so the account team can restore access.",
        ],
      };
    case 'product':
      return {
        variants: [
          "I'm sorry the item arrived faulty. It's within warranty, so I can arrange a free replacement or a full refund. Which would you prefer?",
          'That item is covered by our warranty. I can ship a replacement today or refund it in full; just let me know which works better.',
        ],
      };
    case 'billing':
      return {
        variants: [
          "I can see two charges for the same order. The second is a pending authorisation and should drop off within 3 business days; I've flagged it so it doesn't settle.",
          "I've reviewed your billing history. The duplicate charge is a temporary hold, and I've raised a reversal so it won't be captured.",
        ],
      };
    case 'cancel':
      return {
        variants: [
          "I can help with that. Before I cancel, would a pause or a plan change work better for you? If not, I'll process the cancellation right away.",
          "Understood. I can cancel this for you now, or pause it for up to 3 months if you'd rather keep your history. What would you like?",
        ],
      };
    case 'thanks':
      return {
        variants: [
          `You're welcome, ${firstName(name)}! Is there anything else I can help you with today?`,
          `Happy to help, ${firstName(name)}. Anything else I can do for you?`,
          `Glad that's sorted, ${firstName(name)}! Have a great day.`,
        ],
        closing: true,
      };
    case 'greeting':
      return {
        variants: [
          `Hi ${firstName(name)}! Thanks for reaching out to ${company}. How can I help you today?`,
          `Hello ${firstName(name)}, welcome to ${company} support. What can I do for you?`,
        ],
      };
    case 'human':
      return {
        variants: [
          "I understand you'd like to speak with a person. I'm bringing in a supervisor now and I've shared the full conversation so you won't have to repeat yourself.",
          "Of course. I'm connecting you with a supervisor and passing along everything we've discussed.",
        ],
        escalate: true,
        reason: 'customer_request',
      };
    case 'injection':
      return {
        variants: [
          "I'm not able to change or bypass our policies, but I'm happy to help within them. Could you tell me more about the issue?",
          "I can't override policy instructions, but I can definitely look into your request. What's going on with your order?",
        ],
        flagged: true,
      };
    default:
      return {
        variants: [
          'I want to make sure I get this right. Could you share your order number or a bit more detail about the issue?',
          "Thanks for the details. To help faster, could you tell me the order number and what you'd like us to do?",
        ],
        fallback: true,
      };
  }
}

const EMPATHY_OPENERS = {
  refund: ["I'm sorry this delay is creating stress.", "I'm sorry you've had to chase this refund.", 'I completely understand how frustrating a stuck refund is.'],
  delivery: ["I'm sorry your order hasn't arrived yet.", 'I know waiting on a delivery is frustrating.'],
  account: ["I'm sorry you're locked out, that's stressful.", 'I understand how disruptive losing access can be.'],
  product: ["I'm really sorry about this.", "That's disappointing, I'm sorry."],
  billing: ["I'm sorry about the confusion with your bill.", 'I understand unexpected charges are worrying.'],
  default: ["I'm sorry for the trouble.", 'I understand this has been frustrating.'],
};

const FOLLOW_UPS = [
  "I'm on it and I'll update you here as soon as there's progress.",
  "I've marked this as a priority so it moves faster. Thanks for bearing with me.",
  "I've added your latest details to the case and I'm following it through.",
];

const FLOURISHES = [
  "I'll keep an eye on this personally until it's sorted.",
  "I've added a note to your profile so the next agent has the full story.",
  "If anything changes on our side, you'll hear from us first.",
];

function truncateToTokens(text, maxTokens) {
  if (!maxTokens || estimateTokens(text) <= maxTokens) return { text, finish: 'stop' };
  const words = text.split(/\s+/);
  const keep = Math.max(1, Math.floor(maxTokens / 1.3));
  return { text: `${words.slice(0, keep).join(' ')}…`, finish: 'length' };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------
export function generateReply(request) {
  const { messages = [], temperature = 0.7, max_tokens: maxTokens = 512, metadata = {} } = request;
  const persona = { empathy: 0.6, responseSpeed: 0.5, stability: 0.7, ...(metadata.persona || {}) };
  const caps = { refunds: true, orderLookup: true, knowledgeBase: true, autoEscalate: true, accountChanges: false, ...(metadata.capabilities || {}) };
  const escalation = { sentimentThreshold: -0.55, refundValueThreshold: 5000, confidenceThreshold: 0.64, ...(metadata.escalation || {}) };
  const context = metadata.context || {};
  const task = metadata.task || 'reply';

  const userText = lastUserMessage(messages);
  const effTemp = clamp(temperature + (0.5 - persona.stability) * 0.3, 0, 1);
  const rng = createRng(metadata.seed ?? `${userText}|${temperature}|${messages.length}`);

  if (task === 'resume') return resumeAfterHandoff({ context, rng, effTemp, maxTokens });

  let { intent, score: intentScore } = detectIntent(userText);
  let contextual = false;
  // Like a real model, read short follow-ups ("please hurry") in the context of the earlier turns.
  if (intent === 'fallback') {
    const earlier = messages.filter((m) => m.role === 'user').slice(0, -1).map((m) => m.content).join(' ');
    const ctxIntent = detectIntent(earlier);
    if (!['fallback', 'thanks', 'greeting', 'injection', 'human'].includes(ctxIntent.intent)) {
      intent = ctxIntent.intent;
      intentScore = Number((ctxIntent.score * 0.88).toFixed(2));
      contextual = true;
    }
  }
  const sentiment = analyzeSentiment(userText);
  const amount = extractAmount(userText) ?? (intent === 'refund' ? context.refundAmount ?? null : null);
  const limit = escalation.refundValueThreshold;

  const body = bodyFor(intent, {
    caps, amount, limit, orderId: context.orderId, name: context.customerName,
    company: context.company || 'ABC Company', currency: context.currency || 'INR', hasCode: /\b\d{4,8}\b/.test(userText), wantsLabel: /\blabel\b/i.test(userText),
  });

  // Don't repeat the previous assistant turn word for word.
  const previous = [...messages].reverse().find((m) => m.role === 'assistant')?.content || '';
  let variants = body.variants.filter((v) => !previous.includes(v));
  if (!variants.length) variants = [FOLLOW_UPS[Math.floor(rng() * FOLLOW_UPS.length)]];

  const parts = [];
  if (persona.empathy >= 0.6 && sentiment.score < -0.1 && !['thanks', 'greeting', 'injection'].includes(intent)) {
    parts.push(pick(EMPATHY_OPENERS[intent] || EMPATHY_OPENERS.default, rng, effTemp));
  }
  parts.push(pick(variants, rng, effTemp));

  // Retrieval-augmented citation when the knowledge capability is on and the vector DB returned something relevant.
  const citations = [];
  const kb = Array.isArray(context.kb) ? context.kb : [];
  if (caps.knowledgeBase && kb.length && (kb[0].score ?? 1) >= 0.12 && !['thanks', 'greeting'].includes(intent)) {
    const doc = kb[0];
    citations.push({ id: doc.id, title: doc.title, score: doc.score });
    if (persona.responseSpeed < 0.85) parts.push(`Per our ${doc.title} (${doc.id}): ${firstSentence(doc.content)}`);
  }

  // Escalation recommendation.
  let escalate = Boolean(body.escalate);
  let escalationReason = body.reason || null;
  if (!escalate && caps.autoEscalate && sentiment.score <= escalation.sentimentThreshold && intent !== 'thanks') {
    escalate = true;
    escalationReason = 'sentiment';
    parts.push("I've also asked a supervisor to look at this with me so we can resolve it quickly.");
  }

  if (effTemp > 0.75 && rng() < effTemp - 0.5 && !body.closing) parts.push(FLOURISHES[Math.floor(rng() * FLOURISHES.length)]);

  // Confidence model.
  let confidence = body.fallback ? 0.38 : intentScore;
  if (citations.length) confidence += 0.06;
  if (!caps.knowledgeBase && ['refund', 'billing', 'account', 'delivery'].includes(intent)) confidence -= 0.12;
  if (body.flagged) confidence -= 0.2;
  confidence -= 0.08 * effTemp;
  confidence = Number(clamp(confidence, 0.2, 0.98).toFixed(2));
  if (!escalate && caps.autoEscalate && confidence <= escalation.confidenceThreshold && !body.closing) {
    escalate = true;
    escalationReason = 'confidence';
  }

  const { text, finish } = truncateToTokens(parts.join(' '), maxTokens);

  return {
    content: text,
    finishReason: finish,
    analysis: {
      task,
      intent,
      intentScore,
      contextual,
      sentiment: sentiment.score,
      sentimentLabel: sentiment.label,
      urgent: sentiment.urgent,
      confidence,
      amount,
      citations,
      escalate,
      escalationReason,
      closing: Boolean(body.closing),
      fallback: Boolean(body.fallback),
      flagged: Boolean(body.flagged),
      effectiveTemperature: Number(effTemp.toFixed(2)),
    },
  };
}

function resumeAfterHandoff({ context, rng, effTemp, maxTokens }) {
  const name = firstName(context.customerName);
  const notes = String(context.supervisorNotes || '').toLowerCase();
  const parts = [pick([
    `Thanks for your patience, ${name}. I'm back with you and I have the full context from my supervisor.`,
    `Hi ${name}, I'm picking this back up with everything my supervisor shared.`,
  ], rng, effTemp)];
  // Most specific outcome first: "replacement approved" is about a replacement, not a refund.
  if (/replace|reship|resend/.test(notes)) parts.push("We're sending a replacement and I'll share tracking as soon as it ships.");
  else if (/unlock|access|password/.test(notes)) parts.push('Your account access has been restored, so you can sign in again now.');
  else if (/refund/.test(notes)) parts.push('Your refund has been approved and will reach your original payment method within 24 hours.');
  else if (/reverse|charge/.test(notes)) parts.push("The extra charge has been reversed, so you'll see it drop off within 3 business days.");
  else if (notes.trim()) parts.push("I'll take care of the next steps that were agreed.");
  parts.push('Is there anything else I can help with?');
  const { text, finish } = truncateToTokens(parts.join(' '), maxTokens);
  return {
    content: text,
    finishReason: finish,
    analysis: { task: 'resume', intent: 'resume', intentScore: 0.9, sentiment: 0, sentimentLabel: 'neutral', urgent: false, confidence: 0.9, amount: null, citations: [], escalate: false, escalationReason: null, closing: false, fallback: false, flagged: false, effectiveTemperature: Number(effTemp.toFixed(2)) },
  };
}

// Supervisor co-pilot: reads the whole conversation and proposes a next-best action.
export function generateCopilot(request) {
  const { messages = [], metadata = {} } = request;
  const context = metadata.context || {};
  const escalation = { refundValueThreshold: 5000, ...(metadata.escalation || {}) };
  const customerText = messages.filter((m) => m.role === 'user').map((m) => m.content).join(' ');
  const { intent } = detectIntent(customerText);
  const sentiment = analyzeSentiment(customerText);
  const name = firstName(context.customerName);
  const amount = context.refundAmount ?? extractAmount(customerText);
  const currency = context.currency || 'INR';
  const evidence = Array.isArray(context.evidence) && context.evidence.length ? context.evidence : null;
  const kbTop = Array.isArray(context.kb) && context.kb.length ? context.kb[0] : null;

  let rec;
  switch (intent) {
    case 'refund':
      rec = amount != null && amount > escalation.refundValueThreshold
        ? {
          action: 'approve_refund',
          summary: `Approve expedited refund of ${money(amount, currency)} and waive the standard review period.`,
          evidence: evidence || ['return scan received', 'item category eligible', `customer lifetime value: ${context.tier === 'VIP' ? 'high' : 'medium'}`],
          suggestedReply: `Hi ${name}, I've reviewed the return evidence and approved an expedited refund of ${money(amount, currency)}. You'll see it on your original payment method within 24 hours.`,
          confidence: 0.88,
        }
        : {
          action: 'approve_refund',
          summary: `Release the standard refund${amount != null ? ` of ${money(amount, currency)}` : ''} now that the return scan is confirmed.`,
          evidence: evidence || ['return scan received', 'within 30-day window'],
          suggestedReply: `Hi ${name}, your return is confirmed and I've released the refund. It should arrive within 3–5 business days.`,
          confidence: 0.82,
        };
      break;
    case 'delivery':
      rec = {
        action: 'reship',
        summary: 'Approve a free express reshipment and open a carrier investigation.',
        evidence: evidence || ['carrier exception scan', 'no delivery confirmation', 'first claim on this order'],
        suggestedReply: `Hi ${name}, I'm sorry about the delivery problem. I've sent a replacement by express shipping at no cost and opened an investigation with the courier.`,
        confidence: 0.79,
      };
      break;
    case 'account':
      rec = {
        action: 'unlock_account',
        summary: 'Verify identity via registered email, then unlock the account and force a password reset.',
        evidence: evidence || ['5 failed sign-ins from known device', 'no fraud signals', 'email verified'],
        suggestedReply: `Hi ${name}, I've verified your identity and unlocked your account. Please reset your password using the link I've just emailed you.`,
        confidence: 0.84,
      };
      break;
    case 'product':
      rec = {
        action: 'replace_item',
        summary: 'Offer an immediate replacement under warranty and skip the return-first requirement.',
        evidence: evidence || ['photo of defect provided', 'within warranty period'],
        suggestedReply: `Hi ${name}, I'm sorry about the faulty item. I've arranged a replacement that ships today, and you don't need to send the original back first.`,
        confidence: 0.81,
      };
      break;
    case 'billing':
      rec = {
        action: 'reverse_charge',
        summary: 'Reverse the duplicate authorisation and confirm the corrected invoice by email.',
        evidence: evidence || ['two authorisations on same order', 'single shipment'],
        suggestedReply: `Hi ${name}, I've reversed the duplicate charge and emailed you a corrected invoice. The hold should disappear within 3 business days.`,
        confidence: 0.86,
      };
      break;
    case 'cancel':
      rec = {
        action: 'retention_offer',
        summary: 'Offer a 3-month pause or 20% discount before processing cancellation.',
        evidence: evidence || ['tenure over 2 years', 'no prior retention offers'],
        suggestedReply: `Hi ${name}, before I cancel, I can pause your plan for 3 months or apply 20% off your next 6 months. Would either of those help?`,
        confidence: 0.72,
      };
      break;
    default:
      rec = {
        action: 'reply',
        summary: 'Ask a clarifying question to confirm the order and desired outcome.',
        evidence: evidence || ['intent unclear from transcript'],
        suggestedReply: `Hi ${name}, I'm a supervisor and I'm taking a look at this personally. Could you confirm your order number so I can resolve it right away?`,
        confidence: 0.6,
      };
  }
  if (sentiment.score <= -0.5) rec.confidence = Number(Math.min(0.95, rec.confidence + 0.02).toFixed(2));
  if (kbTop) rec.policy = { id: kbTop.id, title: kbTop.title };
  return { content: JSON.stringify(rec), finishReason: 'stop', analysis: { task: 'copilot', intent, sentiment: sentiment.score } };
}
