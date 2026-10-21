import { DAY, MINUTE, mean, round } from '../lib/util.ts';
import { store } from '../store.ts';
import type { Conversation, Snapshot } from '../types.ts';

export const QUEUE_LABELS: Record<string, string> = {
  Refund: 'Returns & refunds',
  Delivery: 'Order tracking',
  Product: 'Product support',
  Account: 'Account access',
  Billing: 'Billing & payments',
};

const isAtRisk = (c: Conversation, now: number) => c.slaDueAt - now < 10 * MINUTE || c.risk >= 80;

export function recordSnapshot(now = Date.now()): void {
  const active = store.activeConversations();
  const byRegion: Snapshot['byRegion'] = {};
  for (const c of active) {
    const entry = byRegion[c.customer.region] ?? [0, 0];
    entry[0] += 1;
    if (isAtRisk(c, now)) entry[1] += 1;
    byRegion[c.customer.region] = entry;
  }
  store.state.snapshots.push({ t: now, active: active.length, atRisk: active.filter((c) => isAtRisk(c, now)).length, byRegion });
}

function snapshotValue(s: Snapshot, region: string): [number, number] {
  return region === 'all' ? [s.active, s.atRisk] : s.byRegion[region] ?? [0, 0];
}

function nearestSnapshot(t: number): Snapshot | null {
  const snaps = store.state.snapshots;
  let best: Snapshot | null = null;
  for (const s of snaps) if (!best || Math.abs(s.t - t) < Math.abs(best.t - t)) best = s;
  return best;
}

function resolvedBetween(convs: Conversation[], from: number, to: number) {
  return convs.filter((c) => c.status === 'resolved' && c.resolvedAt != null && c.resolvedAt >= from && c.resolvedAt < to);
}

function outcomeStats(list: Conversation[]) {
  if (!list.length) return { containment: null, aht: null, csat: null, n: 0 };
  return {
    containment: (list.filter((c) => c.resolvedBy === 'ai').length / list.length) * 100,
    aht: mean(list.map((c) => (c.resolvedAt! - c.startedAt) / 1000)),
    csat: mean(list.filter((c) => c.csat != null).map((c) => c.csat!)),
    n: list.length,
  };
}

const diff = (a: number | null, b: number | null, digits = 1) => (a == null || b == null ? null : round(a - b, digits));

export function computeMetrics(rangeMin: number, region: string) {
  const now = Date.now();
  const R = rangeMin * MINUTE;
  const all = store.state.conversations;
  const convs = region === 'all' ? all : all.filter((c) => c.customer.region === region);
  const active = convs.filter((c) => c.status !== 'resolved');
  const atRisk = active.filter((c) => isAtRisk(c, now));

  const then = nearestSnapshot(now - R);
  const [thenActive, thenAtRisk] = then ? snapshotValue(then, region) : [0, 0];

  const cur = outcomeStats(resolvedBetween(convs, now - R, now));
  const prev = outcomeStats(resolvedBetween(convs, now - 2 * R, now - R));
  const responders = convs.filter((c) => c.firstResponseAt != null && c.startedAt >= now - R);
  const frt = mean(responders.map((c) => (c.firstResponseAt! - c.startedAt) / 1000));

  // Trend: 12 buckets across the window, averaged from monitoring snapshots, plus the live "now" point.
  const bucketMs = R / 12;
  const points: { t: number; live: number; exposure: number }[] = [];
  let carry: [number, number] = [thenActive, thenAtRisk];
  for (let b = 0; b < 12; b += 1) {
    const from = now - R + b * bucketMs;
    const inBucket = store.state.snapshots.filter((s) => s.t >= from && s.t < from + bucketMs);
    if (inBucket.length) {
      const vals = inBucket.map((s) => snapshotValue(s, region));
      carry = [round(mean(vals.map((v) => v[0]))!, 1), round(mean(vals.map((v) => v[1]))!, 1)];
    }
    points.push({ t: from + bucketMs / 2, live: carry[0], exposure: carry[1] });
  }
  points.push({ t: now, live: active.length, exposure: atRisk.length });

  const queues = Object.keys(QUEUE_LABELS).map((queue) => {
    const inQueue = active.filter((c) => c.queue === queue);
    const probability = Math.round(100 * (1 - inQueue.reduce((p, c) => p * (1 - (c.risk / 100) * 0.6), 1)));
    const status = probability >= 85 ? 'critical' : probability >= 70 ? 'watch' : probability >= 50 ? 'elevated' : 'healthy';
    return { queue, label: QUEUE_LABELS[queue], probability, status, active: inQueue.length };
  }).sort((a, b) => b.probability - a.probability);

  const regions = [...new Set(all.map((c) => c.customer.region))].sort();

  return {
    generatedAt: now,
    rangeMin,
    region,
    scope: { queues: Object.keys(QUEUE_LABELS).length, regions: regions.length, agents: store.state.agents.length, regionList: regions },
    kpis: {
      activeLoad: { value: active.length, delta: thenActive ? round(((active.length - thenActive) / thenActive) * 100, 1) : null },
      slaAtRisk: { value: atRisk.length, delta: then ? Math.round(atRisk.length - thenAtRisk) : null },
      containment: { value: cur.containment == null ? null : round(cur.containment, 1), delta: diff(cur.containment, prev.containment), resolved: cur.n },
      avgHandleSec: { value: cur.aht == null ? null : Math.round(cur.aht), delta: diff(cur.aht, prev.aht, 0) },
      firstResponseSec: { value: frt == null ? null : Math.round(frt) },
      csat: { value: cur.csat == null ? null : round(cur.csat, 1), delta: diff(cur.csat, prev.csat), responses: cur.n },
    },
    series: { bucketMin: round(rangeMin / 12, 1), points },
    queues,
  };
}

export function agentPerformance(agentId: string) {
  const now = Date.now();
  const agent = store.agent(agentId);
  const mine = store.state.conversations.filter((c) => c.agentId === agentId);
  const cur = outcomeStats(resolvedBetween(mine, now - 7 * DAY, now));
  const prev = outcomeStats(resolvedBetween(mine, now - 14 * DAY, now - 7 * DAY));
  return {
    containment: { value: cur.containment == null ? null : round(cur.containment, 1), delta: diff(cur.containment, prev.containment) },
    csat: { value: cur.csat == null ? null : round(cur.csat, 1), delta: diff(cur.csat, prev.csat) },
    fallback: { value: round(agent.stats.fallbackRate * 100, 1), delta: round((agent.stats.fallbackRate - agent.stats.prevFallbackRate) * 100, 1) },
    hallucination: { value: round(agent.stats.hallucinationRate * 100, 1), delta: round((agent.stats.hallucinationRate - agent.stats.prevHallucinationRate) * 100, 1) },
    resolved: cur.n,
  };
}
