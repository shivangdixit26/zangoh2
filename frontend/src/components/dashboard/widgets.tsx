import { ArrowUpRight, Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { ACTION_LABEL, AGENT_LABEL, clock, cx, duration, QUEUE_LABEL } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { attempt, useLive } from '../../store/live';
import type { Alert, ConversationSummary, FeedEvent, Kpi, Metrics, Priority } from '../../types';
import { Card, CardHeader, DeltaChip, Empty, IconButton, PillSelect, ProgressBar, RiskBadge } from '../ui';

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------
export function KpiCard({ label, value, delta, deltaText, good, caption }: {
  label: string; value: string; delta: Kpi['delta']; deltaText?: string; good: 'up' | 'down'; caption?: string;
}) {
  const isGood = delta == null ? null : good === 'up' ? delta >= 0 : delta <= 0;
  return (
    <Card className="flex min-h-[104px] flex-col justify-between gap-2 px-3.5 py-3.5 sm:px-4 sm:py-4">
      <div className="flex flex-wrap items-start justify-between gap-1.5">
        <p className="label-caps text-[10.5px] text-ink-soft">{label}</p>
        {delta != null && deltaText && <DeltaChip text={deltaText} good={isGood} />}
      </div>
      <div>
        <p className="text-[26px] font-semibold leading-tight tracking-tight text-ink tabular-nums transition-all sm:text-[30px]">{value}</p>
        {caption && <p className="mt-0.5 truncate text-[11px] text-muted">{caption}</p>}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Queue health
// ---------------------------------------------------------------------------
const QUEUE_STYLE: Record<string, { color: string; text: string; label: string }> = {
  critical: { color: '#dc4c4c', text: 'text-critical-ink', label: '' },
  watch: { color: '#e3a336', text: 'text-warn-ink', label: '(Watch) ' },
  elevated: { color: '#5b86c6', text: 'text-info-ink', label: '(Watch) ' },
  healthy: { color: '#3f9b62', text: 'text-ok-ink', label: '(Healthy) ' },
};

export function QueueHealth({ queues, onSelect, selected }: { queues: Metrics['queues']; onSelect: (q: string) => void; selected: string }) {
  return (
    <Card className="p-5">
      <CardHeader title="Queue health" subtitle="Prioritized by breach probability" />
      <div className="mt-4 flex flex-col gap-4">
        {queues.slice(0, 4).map((q) => {
          const s = QUEUE_STYLE[q.status];
          return (
            <button key={q.queue} onClick={() => onSelect(selected === q.queue ? 'all' : q.queue)} className={cx('group rounded-lg text-left', selected === q.queue && 'ring-2 ring-brand-200 ring-offset-4')} title={`${q.active} active conversation${q.active === 1 ? '' : 's'}, click to filter the queue table`}>
              <div className="mb-2 flex items-center justify-between text-[13px]">
                <span className="text-ink group-hover:text-brand-800">{q.label}</span>
                <span className={cx('text-xs font-semibold tabular-nums', s.text)}>{s.label}{q.probability}%</span>
              </div>
              <ProgressBar value={q.probability} color={s.color} className="h-2" />
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Critical signals (alerts that need a supervisor)
// ---------------------------------------------------------------------------
const AGGREGATE = new Set(['sla_cluster', 'sentiment_anomaly', 'agent_degradation']);

export function alertLink(a: Alert) {
  if (a.conversationId) return `/conversations/${a.conversationId}`;
  if (a.agentId) return `/agents/${a.agentId}`;
  if (a.queue) return `/?queue=${a.queue}`;
  return '/';
}

export function CriticalSignals() {
  const alertsMap = useLive((s) => s.alerts);
  const [showAll, setShowAll] = useState(false);
  const alerts = useMemo(() => Object.values(alertsMap)
    .filter((a) => a.status === 'open')
    .sort((a, b) => Number(AGGREGATE.has(b.rule)) - Number(AGGREGATE.has(a.rule)) || (a.severity === b.severity ? b.createdAt - a.createdAt : a.severity === 'critical' ? -1 : 1)), [alertsMap]);
  const shown = showAll ? alerts : alerts.slice(0, 3);
  return (
    <Card className="flex flex-col p-5">
      <CardHeader title="Critical signals" subtitle="Needs supervisor action" />
      <div className={cx('mt-4 flex flex-col gap-2.5', showAll && 'max-h-[260px] overflow-auto pr-1 scroll-thin')}>
        {!alerts.length && <Empty title="No open signals" body="New alerts appear here instantly." className="py-6" />}
        {shown.map((a) => (
          <div key={a.id} className={cx('group relative flex items-start gap-3 rounded-xl px-3.5 py-3', a.severity === 'critical' ? 'bg-critical-soft' : 'bg-[#f6f4f9]')}>
            <span className={cx('mt-1.5 size-2.5 shrink-0 rounded-full', a.severity === 'critical' ? 'bg-critical' : 'bg-warn')} />
            <Link to={alertLink(a)} className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ink">{a.title}</p>
              <p className="line-clamp-2 text-[11.5px] text-ink-soft">{a.detail}</p>
            </Link>
            <IconButton label="Acknowledge" onClick={() => attempt(() => api.ackAlert(a.id))} className="size-7 text-muted opacity-0 hover:bg-white hover:text-ok-ink group-hover:opacity-100 focus:opacity-100">
              <Check className="size-4" />
            </IconButton>
          </div>
        ))}
      </div>
      {alerts.length > 3 && (
        <button onClick={() => setShowAll((s) => !s)} className="mt-3 self-start text-xs font-semibold text-brand-700 hover:underline">
          {showAll ? 'Show fewer' : `View all ${alerts.length} signals`}
        </button>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Priority conversation queue
// ---------------------------------------------------------------------------
export interface QueueFilters { queue: string; priority: 'all' | Priority; control: 'all' | 'ai' | 'supervisor'; sort: 'risk' | 'wait' | 'newest' }

export function PriorityQueue({ conversations, filters, onFilters }: { conversations: ConversationSummary[]; filters: QueueFilters; onFilters: (f: QueueFilters) => void }) {
  const now = useNow();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = conversations.filter((c) => c.status !== 'resolved'
      && (filters.queue === 'all' || c.queue === filters.queue)
      && (filters.priority === 'all' || c.priority === filters.priority)
      && (filters.control === 'all' || c.control === filters.control));
    return list.sort((a, b) => filters.sort === 'wait' ? a.startedAt - b.startedAt : filters.sort === 'newest' ? b.startedAt - a.startedAt : b.risk - a.risk);
  }, [conversations, filters]);

  const act = async (c: ConversationSummary) => {
    if (c.recommendedAction === 'take_over') {
      setBusy(c.id);
      const ok = await attempt(() => api.takeOver(c.id), `You took over #${c.caseNumber}`);
      setBusy(null);
      if (ok) navigate(`/conversations/${c.id}`);
      return;
    }
    if (c.recommendedAction === 'send_template') return navigate(`/conversations/${c.id}?templates=1`);
    navigate(`/conversations/${c.id}`);
  };

  const set = (patch: Partial<QueueFilters>) => onFilters({ ...filters, ...patch });

  return (
    <Card className="p-4 sm:p-5">
      <CardHeader
        title="Priority conversation queue"
        subtitle="AI-ranked by urgency, value, and breach risk"
        right={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <PillSelect value={filters.queue} onChange={(v) => set({ queue: v })} options={[{ value: 'all', label: 'All queues' }, ...Object.keys(QUEUE_LABEL).map((q) => ({ value: q, label: q }))]} />
            <PillSelect value={filters.priority} onChange={(v) => set({ priority: v })} options={[{ value: 'all', label: 'All priorities' }, { value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' }, { value: 'watch', label: 'Watch' }, { value: 'normal', label: 'Normal' }]} />
            <PillSelect value={filters.control} onChange={(v) => set({ control: v })} options={[{ value: 'all', label: 'AI & human' }, { value: 'ai', label: 'AI-handled' }, { value: 'supervisor', label: 'Supervisor-handled' }]} />
            <PillSelect value={filters.sort} onChange={(v) => set({ sort: v })} align="right" options={[{ value: 'risk', label: 'Sort: risk' }, { value: 'wait', label: 'Sort: wait' }, { value: 'newest', label: 'Sort: newest' }]} />
            <IconButton label="Open conversations" onClick={() => navigate('/conversations')} className="h-8 w-12 rounded-full bg-brand-50 text-brand-900 hover:bg-brand-100"><ArrowUpRight className="size-4" /></IconButton>
          </div>
        )}
      />
      {/* Phones: one card per conversation instead of a wide table. */}
      <ul className="mt-4 flex flex-col gap-2.5 md:hidden">
        {rows.slice(0, 8).map((c) => (
          <li key={c.id}>
            <div role="button" tabIndex={0} onClick={() => navigate(`/conversations/${c.id}`)} onKeyDown={(e) => e.key === 'Enter' && navigate(`/conversations/${c.id}`)} className="rounded-xl border border-line px-3.5 py-3 active:bg-brand-50">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{c.customer.name} · #{c.caseNumber}</p>
                  <p className="truncate text-[11.5px] text-muted">{c.queue} · {c.control === 'supervisor' ? c.supervisor : AGENT_LABEL[c.agentId] ?? c.agentId}{c.status === 'escalated' ? ' · Escalated' : ''}</p>
                </div>
                <RiskBadge risk={c.risk} />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11.5px] tabular-nums text-ink-soft">Wait {duration(now - c.startedAt)}</span>
                <button onClick={(e) => { e.stopPropagation(); act(c); }} disabled={busy === c.id} className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 disabled:opacity-50">
                  {busy === c.id ? 'Taking over…' : ACTION_LABEL[c.recommendedAction]}
                </button>
              </div>
            </div>
          </li>
        ))}
        {!rows.length && <Empty title="No conversations match these filters" />}
      </ul>
      <div className="mt-4 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-line text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft">
              <th className="py-2.5 pr-3 font-semibold">Customer / Case</th>
              <th className="py-2.5 pr-3 font-semibold">Queue</th>
              <th className="py-2.5 pr-3 font-semibold">AI Owner</th>
              <th className="py-2.5 pr-3 font-semibold">Risk</th>
              <th className="py-2.5 pr-3 font-semibold">Wait</th>
              <th className="py-2.5 font-semibold">Recommended action</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((c) => (
              <tr key={c.id} onClick={() => navigate(`/conversations/${c.id}`)} className="cursor-pointer border-b border-line/70 text-[13px] last:border-0 hover:bg-brand-50/60">
                <td className="py-3 pr-3 font-semibold text-ink">
                  {c.customer.name} · #{c.caseNumber}
                  {c.status === 'escalated' && <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-[10px] font-semibold text-warn-ink">Escalated</span>}
                </td>
                <td className="py-3 pr-3 text-ink-soft">{c.queue}</td>
                <td className="py-3 pr-3 text-ink-soft">{c.control === 'supervisor' ? <span className="text-brand-700">{c.supervisor}</span> : AGENT_LABEL[c.agentId] ?? c.agentId}</td>
                <td className="py-3 pr-3"><RiskBadge risk={c.risk} /></td>
                <td className="py-3 pr-3 tabular-nums text-ink-soft">{duration(now - c.startedAt)}</td>
                <td className="py-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); act(c); }}
                    disabled={busy === c.id}
                    className="text-[13px] font-semibold text-brand-800 hover:underline disabled:opacity-50"
                  >
                    {busy === c.id ? 'Taking over…' : ACTION_LABEL[c.recommendedAction]}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty title="No conversations match these filters" />}
      </div>
      {rows.length > 8 && <Link to="/conversations" className="mt-3 inline-block text-xs font-semibold text-brand-700 hover:underline">Showing 8 of {rows.length}. View all</Link>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Live supervisor feed
// ---------------------------------------------------------------------------
const FEED_DOT: Record<FeedEvent['tone'], string> = { critical: 'bg-critical', warning: 'bg-warn', info: 'bg-brand-700', success: 'bg-ok' };

export function LiveFeed() {
  const live = useLive((s) => s.feed);
  const [auto, setAuto] = useState(true);
  const [frozen, setFrozen] = useState<FeedEvent[]>([]);
  const items = auto ? live : frozen;
  const pending = auto ? 0 : live.filter((e) => !frozen.some((f) => f.id === e.id)).length;

  const toggle = () => {
    if (auto) setFrozen(live);
    setAuto((a) => !a);
  };

  return (
    <Card className="flex flex-col p-5">
      <CardHeader
        title="Live supervisor feed"
        subtitle="Decisions, handoffs, and model events"
        right={(
          <button onClick={toggle} aria-pressed={auto} className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', auto ? 'bg-ok-soft text-ok-ink' : 'bg-[#f1f0f4] text-ink-soft')}>
            <span className={cx('size-1.5 rounded-full', auto ? 'bg-ok pulse-dot' : 'bg-muted')} />
            {auto ? 'Auto-refresh' : 'Paused'}
          </button>
        )}
      />
      {pending > 0 && (
        <button onClick={() => setFrozen(live)} className="mt-3 rounded-lg bg-brand-50 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100">
          {pending} new event{pending === 1 ? '' : 's'}, show
        </button>
      )}
      <ol className="relative mt-4 max-h-[330px] overflow-auto pr-1 scroll-thin">
        <span className="absolute bottom-2 left-[5px] top-2 w-px bg-line" aria-hidden />
        {items.slice(0, 25).map((e) => {
          const body = (
            <>
              <span className={cx('relative z-10 mt-1 size-[11px] shrink-0 rounded-full ring-4 ring-white', FEED_DOT[e.tone])} />
              <span className="w-16 shrink-0 pt-0.5 text-[11px] tabular-nums text-muted">{clock(e.ts)}</span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-ink">{e.title}</span>
                <span className="block truncate text-[11.5px] text-muted">{e.detail}</span>
              </span>
            </>
          );
          return (
            <li key={e.id} className="slide-in">
              {e.conversationId
                ? <Link to={`/conversations/${e.conversationId}`} className="flex gap-3 rounded-lg py-2.5 hover:bg-brand-50/60">{body}</Link>
                : <div className="flex gap-3 py-2.5">{body}</div>}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
