import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { cx, timeAgo } from '../../lib/format';
import type { AgentDetail, SimulationResult } from '../../types';
import { Badge, Button, Card, Spinner } from '../ui';

function Tile({ label, value, delta, good }: { label: string; value: string; delta: number | null | undefined; good: 'up' | 'down' }) {
  const isGood = delta == null ? null : good === 'up' ? delta >= 0 : delta <= 0;
  return (
    <div className="rounded-2xl bg-[#f8f6fb] px-4 py-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="text-[22px] font-semibold tabular-nums text-ink">{value}</span>
        {delta != null && <span className={cx('pb-1 text-[11px] font-semibold tabular-nums', isGood ? 'text-ok-ink' : 'text-critical-ink')}>{delta > 0 ? '+' : delta < 0 ? '−' : '±'}{Math.abs(delta)}{label === 'CSAT' ? '' : '%'}</span>}
      </div>
    </div>
  );
}

const scoreStyle = (s: number) => (s >= 90 ? { bar: '#3f9b62', tone: 'ok' as const, label: 'Pass' } : s >= 80 ? { bar: '#e3a336', tone: 'warn' as const, label: 'Review' } : { bar: '#dc4c4c', tone: 'critical' as const, label: 'Risk' });

export function PerformancePanel({ detail, failures, evalsRunning }: { detail: AgentDetail; failures: { id: string; prompt: string; score: number; improve: string[] }[] | null; evalsRunning: boolean }) {
  const { performance: p, evals, agent } = detail;
  const [showFailures, setShowFailures] = useState(false);
  const fmt = (v: number | null | undefined, suffix = '%') => (v == null ? '—' : `${v}${suffix}`);
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[17px] font-semibold text-ink">Performance & guardrails</h2>
        <Badge tone="brand" className="px-3 py-1">Last 7 days</Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Tile label="Containment" value={fmt(p.containment.value)} delta={p.containment.delta} good="up" />
        <Tile label="CSAT" value={fmt(p.csat.value, '')} delta={p.csat.delta} good="up" />
        <Tile label="Fallback" value={fmt(p.fallback.value)} delta={p.fallback.delta} good="down" />
        <Tile label="Hallucination" value={fmt(p.hallucination.value)} delta={p.hallucination.delta} good="down" />
      </div>

      <div className="mt-6 flex items-end justify-between gap-2">
        <div>
          <h3 className="text-[16px] font-semibold text-ink">Evaluation suite</h3>
          <p className="text-[11.5px] text-muted">{evals.scenarios} scenarios across policy, tone, safety, and task completion</p>
        </div>
        <span className="text-right text-[10.5px] text-muted">{evalsRunning ? 'Running…' : <>{evals.configVersion} · {timeAgo(evals.ranAt)}</>}</span>
      </div>
      <div className={cx('mt-4 flex flex-col gap-3.5', evalsRunning && 'opacity-50')}>
        {evals.suite.map((s) => {
          const st = scoreStyle(s.score);
          return (
            <div key={s.key} className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_38px_62px] items-center gap-3">
              <span className="truncate text-[13px] text-ink-soft">{s.label}</span>
              <div className="h-2 overflow-hidden rounded-full bg-[#ecebf1]"><div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${s.score}%`, background: st.bar }} /></div>
              <span className="text-right text-xs tabular-nums text-ink-soft">{s.score}%</span>
              <Badge tone={st.tone} className="justify-center">{st.label}</Badge>
            </div>
          );
        })}
      </div>
      {failures && failures.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setShowFailures((s) => !s)} className="text-xs font-semibold text-critical-ink hover:underline">{failures.length} scenario{failures.length === 1 ? '' : 's'} failed in the last run{showFailures ? '' : ', show'}</button>
          {showFailures && (
            <ul className="mt-2 flex max-h-40 flex-col gap-1.5 overflow-auto scroll-thin">
              {failures.map((f) => (
                <li key={f.id} className="rounded-lg bg-critical-soft/60 px-2.5 py-1.5 text-[11px]">
                  <span className="font-semibold text-ink">{f.id} · {f.score}/100</span> <span className="text-ink-soft">“{f.prompt}”</span>
                  <span className="block text-critical-ink">{f.improve.join('; ')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <hr className="my-6 border-line" />
      <h3 className="text-[16px] font-semibold text-ink">Routing matrix</h3>
      <p className="text-[11.5px] text-muted">Traffic split by intent and customer tier</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[380px] text-left text-[12px]">
          <thead>
            <tr className="border-b border-line text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
              {['Intent', 'Model', 'Tier', 'Traffic', 'Failover'].map((h) => <th key={h} className="py-2 pr-2 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {agent.routing.map((r, i) => (
              <tr key={i} className="border-b border-line/70 text-ink-soft last:border-0">
                <td className="py-2.5 pr-2">{r.intent}</td>
                <td className="py-2.5 pr-2">{r.model}</td>
                <td className="py-2.5 pr-2">{r.tier}</td>
                <td className="py-2.5 pr-2">{r.traffic}</td>
                <td className="py-2.5">{r.failover}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ResultBlock({ r, title }: { r: SimulationResult; title: string }) {
  return (
    <div className="rounded-2xl bg-brand-100/70 px-4 py-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">{title} · {r.versionLabel}</p>
      <p className="mt-2 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">{r.response}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {r.tags.map((t) => <span key={t} className="rounded-lg bg-white px-3 py-1 text-[11px] font-semibold text-brand-800">{t}</span>)}
        <span className="rounded-lg bg-white/60 px-2 py-1 text-[10px] text-muted">{r.tokens} tokens · {r.latencyMs} ms</span>
      </div>
    </div>
  );
}

/** Runs a fixed customer scenario against the draft (or live) config, so every tweak is visible before deploy. */
export function SimulationConsole({ agentId, hasDraft, draftStamp, previousVersion }: { agentId: string; hasDraft: boolean; draftStamp: number; previousVersion: string | null }) {
  const [index, setIndex] = useState(17);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [compare, setCompare] = useState<SimulationResult | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    const target = hasDraft ? 'draft' : 'deployed';
    Promise.all([
      api.simulate(agentId, index, target),
      showCompare && previousVersion ? api.simulate(agentId, index, 'previous') : Promise.resolve(null),
    ])
      .then(([r, c]) => { if (!cancelled) { setResult(r); setCompare(c); } })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [agentId, index, hasDraft, draftStamp, showCompare, previousVersion]);

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[17px] font-semibold text-ink">Simulation console</h2>
        <div className="flex items-center gap-1">
          <button aria-label="Previous scenario" onClick={() => setIndex((i) => (i - 1 + (result?.total ?? 24)) % (result?.total ?? 24))} className="rounded-full p-1 text-muted hover:bg-brand-50"><ChevronLeft className="size-4" /></button>
          <Badge tone="info" className="px-3 py-1">Scenario {(result?.index ?? index) + 1}/{result?.total ?? 24}</Badge>
        </div>
      </div>
      {error && <p className="mt-3 rounded-lg bg-critical-soft px-3 py-2 text-xs text-critical-ink">{error}</p>}
      {!result ? <div className="flex h-60 items-center justify-center"><Spinner /></div> : (
        <div className={cx('flex flex-1 flex-col transition-opacity', busy && 'opacity-50')}>
          <div className="mt-4 rounded-2xl bg-[#f8f6fb] px-4 py-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">Customer prompt · {result.scenario.category} · {result.scenario.tier}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink">“{result.scenario.prompt}”</p>
          </div>
          <div className="mt-4"><ResultBlock r={result} title="Agent response" /></div>
          {showCompare && compare && (
            <div className="mt-3">
              <ResultBlock r={compare} title="Compared with" />
              <p className="mt-1 text-right text-[11px] text-muted">{compare.versionLabel}: {compare.verdict} · {compare.score}/100</p>
            </div>
          )}

          <h3 className="mt-5 text-[16px] font-semibold text-ink">Decision trace</h3>
          <p className="text-[11.5px] text-muted">Why the agent {result.tags.includes('Escalated') ? 'chose escalation' : 'answered this way'}</p>
          <dl className="mt-2 divide-y divide-line">
            {result.trace.map((t) => (
              <div key={t.label} className="flex justify-between gap-3 py-2 text-[11.5px]">
                <dt className="text-ink-soft">{t.label}</dt>
                <dd className="text-right text-ink">{t.value}</dd>
              </div>
            ))}
          </dl>

          <h3 className="mt-5 text-[16px] font-semibold text-ink">Evaluation result</h3>
          <p className="text-[11.5px] text-muted">Automated rubric against company policy</p>
          <div className={cx('mt-3 rounded-2xl px-4 py-3.5', result.verdict === 'PASS' ? 'bg-ok-soft' : 'bg-critical-soft')}>
            <p className={cx('text-[18px] font-semibold', result.verdict === 'PASS' ? 'text-ok-ink' : 'text-critical-ink')}>{result.verdict} · {result.score}/100</p>
            {result.feedback.strengths.length > 0 && <p className={cx('mt-1 text-[11.5px]', result.verdict === 'PASS' ? 'text-ok-ink' : 'text-ink-soft')}>Strong: {result.feedback.strengths.join(', ')}.</p>}
            {result.feedback.improve.length > 0 && <p className={cx('mt-0.5 text-[11.5px]', result.verdict === 'PASS' ? 'text-ok-ink' : 'text-critical-ink')}>Improve: {result.feedback.improve.join(', ')}.</p>}
          </div>

          <div className="mt-auto grid grid-cols-2 gap-3 pt-5">
            <Button variant="secondary" disabled={!previousVersion} onClick={() => setShowCompare((s) => !s)}>{showCompare ? 'Hide comparison' : previousVersion ? `Compare v${previousVersion}` : 'No prior version'}</Button>
            <Button onClick={() => setIndex((i) => (i + 1) % (result.total || 24))} loading={busy}>Run next case</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
