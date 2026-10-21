import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { DAY, HOUR, MINUTE, clamp, createRng, pick, round } from './lib/util.ts';
import { computeRisk, priorityFor } from './services/risk.ts';
import type { Agent, AgentConfig, Conversation, FeedEvent, Message, Preset, Queue, Snapshot, State, Template } from './types.ts';

export const SCHEMA_VERSION = 4;

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(config.dataDir, file), 'utf8')) as T;
}

interface RawMessage { role: Message['role']; text: string; minutesAgo: number; author?: string }
interface RawConversation extends Omit<Conversation, 'startedAt' | 'slaDueAt' | 'messages' | 'risk' | 'priority' | 'feedbackNotes' | 'handoffNotes'> {
  startedMinutesAgo: number;
  slaMinutesLeft: number;
  messages: RawMessage[];
}
interface RawAgent extends Omit<Agent, 'deployedAt' | 'evals' | 'stats'> {
  deployedAt: string;
  stats: { fallbackRate: number; hallucinationRate: number };
  evals: { scenarios: number; results: Agent['evals']['results'] };
}
interface RawTemplate extends Omit<Template, 'lastUsedAt' | 'createdAt' | 'updatedAt'> { lastUsedDaysAgo: number | null }
export interface SimulationData {
  customers: { name: string; location: string; region: string; tier: 'VIP' | 'Standard'; language: string }[];
  queues: Record<Queue, { agentId: string; topics: string[]; openers: string[]; followUps: string[] }>;
  closers: string[];
  supervisorReplies: string[];
}
export interface EvalScenario {
  id: string;
  category: 'policy' | 'refund' | 'empathy' | 'injection' | 'knowledge';
  prompt: string;
  tier: 'VIP' | 'Standard';
  refundAmount?: number;
  expect: { intent: string; escalate: boolean | null; cite?: boolean };
}
export interface KbDoc { id: string; source: string; title: string; content: string }

export const loadSimulationData = () => readJson<SimulationData>('simulation.json');
export const loadEvalScenarios = () => readJson<EvalScenario[]>('eval-scenarios.json');
export const loadKnowledgeBase = () => readJson<KbDoc[]>('knowledge-base.json');

const AI_HISTORY_REPLIES: Record<Queue, string> = {
  Refund: "I've confirmed your return and released the refund. It should appear within 3–5 business days.",
  Delivery: "I've checked tracking: your parcel is out for delivery today and you'll get an SMS with the time slot.",
  Account: "I've verified your identity and sent a secure reset link to your registered email.",
  Product: "That item is under warranty, so I've arranged a free replacement that ships today.",
  Billing: "The second charge was a pending authorisation and I've flagged it so it won't settle.",
};

/** One week of resolved conversations so KPIs, deltas and per-agent stats have real data behind them. */
function generateHistory(now: number, sim: SimulationData, agentsById: Map<string, Agent>): Conversation[] {
  const rng = createRng(20261020);
  const queues = Object.keys(sim.queues) as Queue[];
  const queueWeights: Record<Queue, number> = { Refund: 0.3, Delivery: 0.25, Account: 0.15, Product: 0.18, Billing: 0.12 };
  const pickQueue = () => {
    let r = rng();
    for (const q of queues) { r -= queueWeights[q]; if (r <= 0) return q; }
    return queues[0];
  };
  // [count, minAgeMin, maxAgeMin]
  const bands: [number, number, number][] = [[9, 4, 30], [28, 30, 240], [45, 240, 1440], [90, 1440, 7 * 1440], [80, 7 * 1440, 14 * 1440]];
  const out: Conversation[] = [];
  let caseNo = 83800;
  for (const [count, lo, hi] of bands) {
    for (let i = 0; i < count; i += 1) {
      const queue = pickQueue();
      const q = sim.queues[queue];
      const cust = pick(sim.customers, rng);
      const agent = agentsById.get(q.agentId)!;
      const handleMin = 2.5 + rng() * 8.5;
      const resolvedAt = now - (lo + rng() * (hi - lo)) * MINUTE;
      const startedAt = resolvedAt - handleMin * MINUTE;
      const containmentBias = agent.id === 'csr-logistics' ? 0.62 : agent.id === 'csr-finance' ? 0.8 : 0.74;
      const resolvedBy = rng() < containmentBias ? 'ai' : 'supervisor';
      const csat = clamp(Math.round((resolvedBy === 'ai' ? 8.4 : 7.9) + (rng() - 0.45) * 3.4), 4, 10);
      const firstResponseAt = startedAt + (12 + rng() * 55) * 1000;
      const name = cust.name;
      const msgs: Message[] = [
        { id: `m-h${caseNo}-1`, role: 'customer', text: pick(q.openers, rng), ts: startedAt },
        { id: `m-h${caseNo}-2`, role: 'ai', text: AI_HISTORY_REPLIES[queue], ts: firstResponseAt },
      ];
      if (resolvedBy === 'supervisor') {
        msgs.push({ id: `m-h${caseNo}-3`, role: 'system', text: 'A supervisor took over from the AI agent.', ts: startedAt + handleMin * 0.5 * MINUTE });
        msgs.push({ id: `m-h${caseNo}-4`, role: 'supervisor', text: `Hi ${name.split(' ')[0]}, I've reviewed this personally and it's now sorted.`, ts: startedAt + handleMin * 0.7 * MINUTE, author: 'Rahul Mehta' });
      }
      msgs.push({ id: `m-h${caseNo}-5`, role: 'customer', text: pick(sim.closers, rng), ts: resolvedAt - 30_000 });
      out.push({
        id: `c-${caseNo}`,
        caseNumber: String(caseNo),
        customer: {
          id: `cust-h${caseNo}`, name, tier: cust.tier, tenureYears: round(0.5 + rng() * 5, 1), location: cust.location, region: cust.region,
          language: cust.language, lifetimeValue: Math.round(8000 + rng() * 150000), orders: Math.round(2 + rng() * 40), returnRate: round(rng() * 0.12, 3),
        },
        topic: pick(q.topics, rng),
        queue,
        channel: pick(['Web chat', 'Email', 'Mobile', 'Messenger'], rng),
        agentId: agent.id,
        status: 'resolved',
        control: resolvedBy === 'ai' ? 'ai' : 'supervisor',
        supervisor: resolvedBy === 'ai' ? null : 'Rahul Mehta',
        takenOverAt: resolvedBy === 'ai' ? null : startedAt + handleMin * 0.5 * MINUTE,
        startedAt,
        slaDueAt: startedAt + 20 * MINUTE,
        firstResponseAt,
        resolvedAt,
        resolvedBy,
        csat,
        sentiment: round(0.1 + rng() * 0.5),
        aiConfidence: round(0.7 + rng() * 0.25),
        risk: 0,
        priority: 'normal',
        orderId: `ORD-${54000 + Math.floor(rng() * 900)}`,
        refundAmount: null,
        diagnostics: { repeatContact: 0.1, negativeSentiment: 0.1, policyException: 0.05, churnPropensity: 0.1 },
        evidence: [],
        feedbackNotes: '',
        handoffNotes: [],
        copilot: null,
        messages: msgs,
        historical: true,
      });
      caseNo += 1;
    }
  }
  return out;
}

/** Backfilled monitoring snapshots (live load + SLA exposure) so the trend chart has a history on first boot. */
function generateSnapshots(now: number, active: Conversation[]): Snapshot[] {
  const rng = createRng(77);
  const regions = [...new Set(active.map((c) => c.customer.region))];
  const regionShare = Object.fromEntries(regions.map((r) => [r, active.filter((c) => c.customer.region === r).length / Math.max(1, active.length)]));
  const out: Snapshot[] = [];
  const push = (t: number) => {
    const hour = new Date(t).getHours() + new Date(t).getMinutes() / 60;
    const daily = 0.65 + 0.35 * Math.sin(((hour - 9) / 24) * Math.PI * 2);
    const recentRamp = t > now - 3 * HOUR ? 0.85 + 0.15 * ((t - (now - 3 * HOUR)) / (3 * HOUR)) : 1;
    const activeCount = Math.max(2, Math.round(active.length * daily * recentRamp + (rng() - 0.5) * 3));
    const atRisk = Math.max(0, Math.round(activeCount * (0.22 + rng() * 0.18)));
    const byRegion: Snapshot['byRegion'] = {};
    for (const r of regions) byRegion[r] = [round(activeCount * regionShare[r], 1), round(atRisk * regionShare[r], 1)];
    out.push({ t, active: activeCount, atRisk, byRegion });
  };
  for (let t = now - 7 * DAY; t < now - 3 * HOUR; t += 5 * MINUTE) push(t);
  for (let t = now - 3 * HOUR; t < now; t += MINUTE) push(t);
  return out;
}

function parseRelativeDays(s: string, now: number): number {
  const m = /^-(\d+(?:\.\d+)?)d$/.exec(s);
  return m ? now - Number(m[1]) * DAY : now;
}

export function buildInitialState(now = Date.now()): State {
  const rawConvs = readJson<RawConversation[]>('conversations.json');
  const rawAgents = readJson<RawAgent[]>('agents.json');
  const rawPresets = readJson<Omit<Preset, 'createdAt'>[]>('presets.json');
  const rawTemplates = readJson<RawTemplate[]>('templates.json');
  const sim = loadSimulationData();

  const agents: Agent[] = rawAgents.map((a) => ({
    ...a,
    deployedAt: parseRelativeDays(a.deployedAt, now),
    stats: {
      fallbackRate: a.stats.fallbackRate,
      hallucinationRate: a.stats.hallucinationRate,
      prevFallbackRate: round(a.stats.fallbackRate + 0.021, 3),
      prevHallucinationRate: round(a.stats.hallucinationRate + 0.003, 3),
    },
    evals: { ...a.evals, ranAt: now - DAY, configVersion: `v${a.version}` },
  }));
  const agentsById = new Map(agents.map((a) => [a.id, a]));

  const live: Conversation[] = rawConvs.map((raw) => {
    const { startedMinutesAgo, slaMinutesLeft, messages: rawMessages, ...c } = raw;
    const startedAt = now - startedMinutesAgo * MINUTE;
    const conv: Conversation = {
      ...c,
      supervisor: c.supervisor ?? null,
      takenOverAt: c.control === 'supervisor' ? now - (rawMessages.find((m) => m.role === 'system')?.minutesAgo ?? 5) * MINUTE : null,
      startedAt,
      slaDueAt: now + slaMinutesLeft * MINUTE,
      firstResponseAt: null,
      resolvedAt: null,
      resolvedBy: null,
      csat: null,
      risk: 0,
      priority: 'normal',
      feedbackNotes: '',
      handoffNotes: [],
      copilot: null,
      messages: rawMessages.map((m, i) => {
        const agent = agentsById.get(c.agentId)!;
        const author = m.author ?? (m.role === 'ai' ? `${agent.name} v${agent.version}` : undefined);
        return { id: `m-${c.caseNumber}-${i + 1}`, role: m.role, text: m.text, ts: now - m.minutesAgo * MINUTE, ...(author ? { author } : {}) };
      }),
    };
    conv.firstResponseAt = conv.messages.find((m) => m.role === 'ai' || m.role === 'supervisor')?.ts ?? null;
    const cfg: AgentConfig = agentsById.get(conv.agentId)!.config;
    conv.risk = computeRisk(conv, cfg, now);
    conv.priority = priorityFor(conv.risk);
    return conv;
  });

  const history = generateHistory(now, sim, agentsById);

  const templates: Template[] = rawTemplates.map((t, i) => {
    const { lastUsedDaysAgo, ...rest } = t;
    return {
      ...rest,
      lastUsedAt: lastUsedDaysAgo == null ? null : now - lastUsedDaysAgo * DAY,
      createdAt: now - (40 + i) * DAY,
      updatedAt: now - (5 + (i % 7)) * DAY,
    };
  });

  const feedSeed: [number, string, string, string, FeedEvent['tone'], string | null][] = [
    [6.9, 'takeover', 'Takeover approved', 'Mateo G. • by Rahul M.', 'critical', 'c-84199'],
    [7.6, 'kb_fallback', 'Knowledge fallback', 'CSR-Returns • policy gap', 'critical', 'c-84291'],
    [8.9, 'alert', 'SLA alert raised', 'Refund • 2 conversations', 'info', null],
    [10.2, 'template', 'Template inserted', 'Refund delay apology • Marcus L.', 'info', 'c-84275'],
    [11.6, 'deploy', 'Agent version routed', 'CSR-Tech v4.3 • 20% traffic', 'info', null],
    [14.2, 'qa', 'QA sample flagged', 'Low empathy score • #84211', 'info', null],
  ];
  const feed: FeedEvent[] = feedSeed.map(([ago, kind, title, detail, tone, conversationId], i) => ({
    id: `f-seed-${i}`, ts: now - ago * MINUTE, kind, title, detail, tone, conversationId,
  }));

  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: now,
    conversations: [...live, ...history],
    alerts: [],
    feed,
    agents,
    drafts: {},
    presets: rawPresets.map((p) => ({ ...p, createdAt: now - 60 * DAY })),
    templates,
    snapshots: generateSnapshots(now, live),
    simulator: { running: true, speed: 1 },
    counters: { case: 84292, changeRequest: 1842 },
  };
}
