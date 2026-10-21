import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { cx } from '../../lib/format';
import type { AgentConfig, Draft } from '../../types';
import { Badge, Card, ProgressBar, Segmented, Slider, Toggle, type Tone } from '../ui';

type Tab = 'parameters' | 'capabilities' | 'knowledge';

const CAPABILITIES: { key: keyof AgentConfig['capabilities']; label: string; hint: string }[] = [
  { key: 'refunds', label: 'Issue refunds', hint: 'Release refunds up to the refund value threshold without a human.' },
  { key: 'orderLookup', label: 'Order lookup', hint: 'Read live order and tracking data.' },
  { key: 'knowledgeBase', label: 'Knowledge base retrieval', hint: 'Ground answers in policy documents from the vector DB.' },
  { key: 'autoEscalate', label: 'Auto-escalate to supervisors', hint: 'Hand off as soon as any escalation threshold is met.' },
  { key: 'accountChanges', label: 'Account changes', hint: 'Unlock accounts and edit profile details after verification.' },
  { key: 'proactiveCredits', label: 'Proactive credits', hint: 'Offer goodwill credits after service failures.' },
  { key: 'multilingual', label: 'Multilingual replies', hint: "Reply in the customer's language." },
];

const SOURCES: { key: string; label: string; hint: string }[] = [
  { key: 'returns', label: 'Returns & refunds policy', hint: 'REF-12.x · 3 documents' },
  { key: 'shipping', label: 'Shipping & delivery', hint: 'SHP-3.x · 3 documents' },
  { key: 'account', label: 'Account security', hint: 'ACC-2.x · 2 documents' },
  { key: 'product', label: 'Product & warranty', hint: 'PRD-7.x · 2 documents' },
  { key: 'billing', label: 'Billing & subscriptions', hint: 'BIL-4.x · 2 documents' },
  { key: 'general', label: 'Escalation guidelines', hint: 'GEN-1.x · 1 document' },
  { key: 'safety', label: 'Safety & prompt-injection', hint: 'SAF-9.x · 1 document' },
];

const level = (v: number, labels: [string, string, string]) => (v < 0.35 ? labels[0] : v < 0.7 ? labels[1] : labels[2]);

function ParamSlider({ label, valueLabel, left, right, value, min, max, step, onChange }: {
  label: string; valueLabel: string; left: string; right: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">{label}</span>
        <span className="text-[13px] font-semibold tabular-nums text-brand-800">{valueLabel}</span>
      </div>
      <div className="mb-2 flex justify-between text-[10.5px] text-muted"><span>{left}</span><span>{right}</span></div>
      <Slider label={label} value={value} min={min} max={max} step={step} onChange={onChange} />
    </div>
  );
}

function ThresholdInput({ label, hint, prefix, suffix, value, min, max, step, onChange }: {
  label: string; hint: string; prefix?: string; suffix?: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text);
    const clamped = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value;
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-ink-soft" title={hint}>{label}</span>
      <label className="inline-flex h-9 items-center gap-1 rounded-xl border border-line bg-[#fbfaff] px-3 text-[13px] font-semibold text-brand-900 focus-within:border-brand-400">
        {prefix && <span>{prefix}</span>}
        <input
          type="number"
          aria-label={label}
          value={text}
          min={min}
          max={max}
          step={step}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="w-16 bg-transparent text-right tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        {suffix && <span>{suffix}</span>}
      </label>
    </div>
  );
}

function RetrievalTester({ agentId }: { agentId: string }) {
  const [q, setQ] = useState('My refund is above the limit, can it be expedited?');
  const [results, setResults] = useState<Awaited<ReturnType<typeof api.knowledgeSearch>>['results'] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { setResults((await api.knowledgeSearch(q, agentId)).results); } catch { setResults([]); }
    setBusy(false);
  };
  return (
    <div className="mt-4 rounded-xl bg-[#f8f6fb] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Test retrieval</p>
      <div className="mt-2 flex gap-2">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} aria-label="Retrieval test query" className="h-8 w-full rounded-lg border border-line bg-white pl-8 pr-2 text-xs outline-none focus:border-brand-300" />
        </label>
        <button onClick={run} disabled={busy} className="h-8 rounded-lg bg-brand-800 px-3 text-xs font-semibold text-white disabled:opacity-60">{busy ? '…' : 'Search'}</button>
      </div>
      {results && (
        <div className="mt-2 flex flex-col gap-1.5">
          {!results.length && <p className="text-xs text-muted">No documents from the enabled sources match.</p>}
          {results.map((r) => (
            <div key={r.id} className="rounded-lg bg-white px-2.5 py-1.5">
              <div className="flex justify-between text-[11px]"><span className="font-semibold text-ink">{r.id} · {r.title}</span><span className="tabular-nums text-muted">{r.score.toFixed(2)}</span></div>
              <ProgressBar value={r.score * 100} color="#7a63d8" className="mt-1 h-1" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const RISK_TONE: Record<string, Tone> = { Low: 'ok', Moderate: 'warn', High: 'critical' };

export function BehaviorPanel({ agentId, cfg, onChange, draft, version, deployedAt, saving }: {
  agentId: string; cfg: AgentConfig; onChange: (c: AgentConfig) => void; draft: Draft | null; version: string; deployedAt: number; saving: boolean;
}) {
  const [tab, setTab] = useState<Tab>('parameters');
  const p = cfg.parameters;
  const setParam = (k: keyof AgentConfig['parameters'], v: number) => onChange({ ...cfg, parameters: { ...p, [k]: v } });
  const setEsc = (k: keyof AgentConfig['escalation'], v: number) => onChange({ ...cfg, escalation: { ...cfg.escalation, [k]: v } });

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[17px] font-semibold text-ink">Behavior configuration</h2>
        {draft ? <Badge tone="warn" className="px-3 py-1">{saving ? 'Saving…' : 'Draft changes'}</Badge> : <Badge tone="ok" className="px-3 py-1">Live v{version}</Badge>}
      </div>
      <div className="mt-4">
        <Segmented<Tab> size="sm" value={tab} onChange={setTab} options={[{ value: 'parameters', label: 'Parameters' }, { value: 'capabilities', label: 'Capabilities' }, { value: 'knowledge', label: 'Knowledge' }]} />
      </div>

      {tab === 'parameters' && (
        <div className="mt-5 flex flex-col gap-5">
          <ParamSlider label="Creativity / Temperature" valueLabel={p.temperature.toFixed(2)} left="Precise" right="Exploratory" value={p.temperature} min={0} max={1} step={0.01} onChange={(v) => setParam('temperature', v)} />
          <ParamSlider label="Max tokens" valueLabel={String(p.maxTokens)} left="Concise" right="Detailed" value={p.maxTokens} min={32} max={1024} step={16} onChange={(v) => setParam('maxTokens', v)} />
          <ParamSlider label="Response speed" valueLabel={level(p.responseSpeed, ['Measured', 'Balanced', 'Fast'])} left="Measured" right="Fast" value={p.responseSpeed} min={0} max={1} step={0.01} onChange={(v) => setParam('responseSpeed', v)} />
          <ParamSlider label="Empathy" valueLabel={level(p.empathy, ['Neutral', 'Warm', 'High'])} left="Neutral" right="High" value={p.empathy} min={0} max={1} step={0.01} onChange={(v) => setParam('empathy', v)} />
          <ParamSlider label="Stability" valueLabel={p.stability.toFixed(2)} left="Adaptive" right="Stable" value={p.stability} min={0} max={1} step={0.01} onChange={(v) => setParam('stability', v)} />
        </div>
      )}

      {tab === 'capabilities' && (
        <div className="mt-4 flex flex-col divide-y divide-line">
          {CAPABILITIES.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-[13px] font-semibold text-ink">{c.label}</p>
                <p className="text-[11px] text-muted">{c.hint}</p>
              </div>
              <Toggle label={c.label} checked={cfg.capabilities[c.key]} onChange={(v) => onChange({ ...cfg, capabilities: { ...cfg.capabilities, [c.key]: v } })} />
            </div>
          ))}
        </div>
      )}

      {tab === 'knowledge' && (
        <div className="mt-4">
          {!cfg.capabilities.knowledgeBase && <p className="mb-2 rounded-lg bg-warn-soft px-3 py-2 text-[11px] text-warn-ink">Knowledge base retrieval is off under Capabilities, so these sources are not used.</p>}
          <div className={cx('flex flex-col divide-y divide-line', !cfg.capabilities.knowledgeBase && 'opacity-60')}>
            {SOURCES.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-[13px] font-semibold text-ink">{s.label}</p>
                  <p className="text-[11px] text-muted">{s.hint}</p>
                </div>
                <Toggle label={s.label} checked={Boolean(cfg.knowledge[s.key])} onChange={(v) => onChange({ ...cfg, knowledge: { ...cfg.knowledge, [s.key]: v } })} />
              </div>
            ))}
          </div>
          <RetrievalTester agentId={agentId} />
        </div>
      )}

      <hr className="my-5 border-line" />
      <h3 className="text-[16px] font-semibold text-ink">Escalation policy</h3>
      <p className="text-[11.5px] text-muted">Trigger supervisor takeover when any threshold is met</p>
      <div className="mt-4 flex flex-col gap-3">
        <ThresholdInput label="No agent response" hint="Seconds a customer can wait without a reply" suffix="sec" value={cfg.escalation.noAgentResponseSec} min={15} max={900} step={5} onChange={(v) => setEsc('noAgentResponseSec', v)} />
        <ThresholdInput label="Customer sentiment" hint="Escalate when sentiment drops to or below this (−1 to 0)" prefix="≤" value={cfg.escalation.sentimentThreshold} min={-1} max={0} step={0.05} onChange={(v) => setEsc('sentimentThreshold', v)} />
        <ThresholdInput label="Refund value" hint="Refunds at or above this need a supervisor" prefix="≥ ₹" value={cfg.escalation.refundValueThreshold} min={0} max={1000000} step={500} onChange={(v) => setEsc('refundValueThreshold', v)} />
        <ThresholdInput label="Confidence score" hint="Escalate when the AI's confidence is at or below this" prefix="≤" value={cfg.escalation.confidenceThreshold} min={0} max={1} step={0.01} onChange={(v) => setEsc('confidenceThreshold', v)} />
      </div>

      <hr className="my-5 border-line" />
      {draft ? (
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft">Change request</p>
          <p className="mt-1 text-[14px] font-semibold text-ink">{draft.changeRequest} • {draft.changes.length} field{draft.changes.length === 1 ? '' : 's'} modified</p>
          <p className="mt-0.5 text-[11px] text-muted">Owner: {draft.updatedBy} • Reviewer: Ops Governance</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={RISK_TONE[draft.risk.level]} className="px-3 py-1">Risk: {draft.risk.level}</Badge>
            {draft.risk.reasons.slice(0, 2).map((r) => <span key={r} className="text-[11px] text-muted">{r}</span>)}
          </div>
        </div>
      ) : (
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft">Change request</p>
          <p className="mt-1 text-[13px] text-ink-soft">No pending changes. v{version} live since {new Date(deployedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.</p>
          <p className="mt-0.5 text-[11px] text-muted">Edit any setting to open a draft change request.</p>
        </div>
      )}
    </Card>
  );
}
