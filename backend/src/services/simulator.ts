import { config } from '../config.ts';
import { emit } from '../events.ts';
import { MINUTE, pick, round, uid } from '../lib/util.ts';
import { loadSimulationData, type SimulationData } from '../seed.ts';
import { store } from '../store.ts';
import type { Conversation, Queue } from '../types.ts';
import { generateAiReply, isReplyPending, resolveConversation } from './agentRuntime.ts';
import { syncAlerts } from './alerts.ts';
import { appendMessage, refresh } from './convOps.ts';
import { recordSnapshot } from './metrics.ts';

let sim: SimulationData | null = null;
let timer: NodeJS.Timeout | null = null;
let lastSnapshot = 0;
const answeredSupervisorMsgs = new Set<string>();

const EVIDENCE: Record<Queue, string[]> = {
  Refund: ['return scan received', 'within 30-day window'],
  Delivery: ['carrier exception scan', 'no delivery photo'],
  Account: ['failed sign-in attempts', 'no fraud signals'],
  Product: ['photo of defect provided', 'within warranty period'],
  Billing: ['two authorisations on same order'],
};
const IMPATIENT = ['Is anyone there?', 'Hello? I am still waiting for a supervisor.', "This is taking way too long, I'm frustrated."];

const lastVisible = (c: Conversation) => [...c.messages].reverse().find((m) => m.role !== 'note' && m.role !== 'system');
const customerCount = (c: Conversation) => c.messages.filter((m) => m.role === 'customer').length;

export function spawnConversation(now = Date.now()): Conversation {
  sim ??= loadSimulationData();
  const queues = Object.keys(sim.queues) as Queue[];
  const queue = pick(queues);
  const q = sim.queues[queue];
  const activeNames = new Set(store.activeConversations().map((c) => c.customer.name));
  const free = sim.customers.filter((c) => !activeNames.has(c.name));
  const cust = pick(free.length ? free : sim.customers);
  const caseNumber = String(store.state.counters.case++);
  const opener = pick(q.openers);
  const amount = /₹\s?([\d,]+)/.exec(opener);
  const conv: Conversation = {
    id: `c-${caseNumber}`,
    caseNumber,
    customer: {
      id: uid('cust'), name: cust.name, tier: cust.tier, tenureYears: round(0.3 + Math.random() * 6, 1), location: cust.location, region: cust.region,
      language: cust.language, lifetimeValue: Math.round(5000 + Math.random() * 180000), orders: Math.round(1 + Math.random() * 45), returnRate: round(Math.random() * 0.12, 3),
    },
    topic: pick(q.topics),
    queue,
    channel: pick(['Web chat', 'Email', 'Mobile', 'Messenger']),
    agentId: q.agentId,
    status: 'active',
    control: 'ai',
    supervisor: null,
    takenOverAt: null,
    startedAt: now,
    slaDueAt: now + (cust.tier === 'VIP' ? 15 : 20) * MINUTE,
    firstResponseAt: null,
    resolvedAt: null,
    resolvedBy: null,
    csat: null,
    sentiment: -0.1,
    aiConfidence: 0.8,
    risk: 0,
    priority: 'normal',
    orderId: `ORD-${55300 + Math.floor(Math.random() * 600)}`,
    refundAmount: amount ? Number(amount[1].replace(/,/g, '')) : null,
    diagnostics: { repeatContact: round(Math.random() * 0.3), negativeSentiment: 0.1, policyException: round(Math.random() * 0.3), churnPropensity: round(Math.random() * 0.4) },
    evidence: EVIDENCE[queue],
    feedbackNotes: '',
    handoffNotes: [],
    copilot: null,
    messages: [],
  };
  store.state.conversations.unshift(conv);
  appendMessage(conv, { role: 'customer', text: opener });
  return conv;
}

async function tick(): Promise<void> {
  const now = Date.now();
  const active = store.activeConversations();

  // Time-driven state (SLA countdowns, waits) changes even with the simulator paused.
  for (const c of active) if (refresh(c, now)) emit.conversation(c);
  syncAlerts(now);
  if (now - lastSnapshot >= 30_000) {
    recordSnapshot(now);
    lastSnapshot = now;
  }
  emit.metricsChanged();

  if (!store.state.simulator.running) return;
  sim ??= loadSimulationData();

  for (const c of active) {
    const last = lastVisible(c);
    if (!last) continue;
    const age = now - last.ts;

    // The AI answers any customer message in a conversation it controls.
    if (c.control === 'ai' && last.role === 'customer' && age > 1200 && !isReplyPending(c.id)) {
      void generateAiReply(c.id);
      continue;
    }

    // Customers answer supervisors once per supervisor message.
    if (c.control === 'supervisor' && last.role === 'supervisor' && age > 5000 && !answeredSupervisorMsgs.has(last.id) && Math.random() < 0.5) {
      answeredSupervisorMsgs.add(last.id);
      appendMessage(c, { role: 'customer', text: pick(sim.supervisorReplies) });
      continue;
    }

    // Customers keep talking to the AI: follow-ups, or a thank-you that lets the AI close the chat.
    if (c.control === 'ai' && c.status === 'active' && last.role === 'ai' && age > 15_000 && Math.random() < 0.07) {
      const closing = customerCount(c) >= 4 || Math.random() < 0.45;
      appendMessage(c, { role: 'customer', text: closing ? pick(sim.closers) : pick(sim.queues[c.queue].followUps) });
      continue;
    }

    // Escalated chats left waiting make customers impatient.
    if (c.control === 'ai' && c.status === 'escalated' && last.role === 'ai' && age > 45_000 && customerCount(c) < 6 && Math.random() < 0.08) {
      appendMessage(c, { role: 'customer', text: pick(IMPATIENT) });
    }
  }

  // Background colleagues: other supervisors eventually pick up stale escalations and close their own chats.
  for (const c of active) {
    if (c.status === 'escalated' && c.control === 'ai' && now - c.startedAt > 35 * MINUTE) {
      resolveConversation(c, 'supervisor', 'Rahul Mehta');
    } else if (c.control === 'supervisor' && c.supervisor !== config.defaultSupervisor && c.takenOverAt && now - c.takenOverAt > 15 * MINUTE) {
      resolveConversation(c, 'supervisor', c.supervisor ?? 'Rahul Mehta');
    }
  }

  const activeCount = store.activeConversations().length;
  if (activeCount < 7 || (activeCount < 13 && Math.random() < 0.1)) spawnConversation(now);
}

export function startSimulator(): void {
  if (!config.simulatorEnabled) {
    console.log('[sim] disabled via SIMULATOR=off');
    return;
  }
  const loop = () => {
    const interval = config.simTickMs / Math.max(0.25, store.state.simulator.speed);
    timer = setTimeout(async () => {
      try {
        await tick();
      } catch (err) {
        console.error('[sim] tick failed', err);
      } finally {
        loop();
      }
    }, interval);
  };
  loop();
  console.log(`[sim] running, tick every ${config.simTickMs}ms`);
}

export function stopSimulator(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}
