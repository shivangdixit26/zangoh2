import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { VolumeChart } from '../components/dashboard/VolumeChart';
import { CriticalSignals, KpiCard, LiveFeed, PriorityQueue, QueueHealth, type QueueFilters } from '../components/dashboard/widgets';
import { Card, CardHeader, PillSelect, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { clock, cx, duration } from '../lib/format';
import { useMetricsStream } from '../lib/useMetricsStream';
import { useLive } from '../store/live';

const RANGES = [
  { value: '30', label: 'Last 30 min' },
  { value: '240', label: 'Last 4 hours' },
  { value: '1440', label: 'Last 24 hours' },
  { value: '10080', label: 'Last 7 days' },
];

const pct = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)}%`);
const signedNum = (v: number, suffix = '') => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v)}${suffix}`;
const signedDur = (sec: number) => `${sec > 0 ? '+' : sec < 0 ? '−' : '±'}${duration(Math.abs(sec) * 1000).replace(/^0(\d:)/, '$1')}`;

export default function Dashboard() {
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState('30');
  const [region, setRegion] = useState('all');
  const conversationsMap = useLive((s) => s.conversations);
  // KPIs, trend and queue health arrive over Server-Sent Events every 2 seconds.
  const { metrics: m, status, receivedAt } = useMetricsStream(Number(range), region, 2000);

  const filters: QueueFilters = {
    queue: params.get('queue') ?? 'all',
    priority: (params.get('priority') as QueueFilters['priority']) ?? 'all',
    control: (params.get('control') as QueueFilters['control']) ?? 'all',
    sort: (params.get('sort') as QueueFilters['sort']) ?? 'risk',
  };
  const setFilters = (f: QueueFilters) => {
    const next = new URLSearchParams();
    if (f.queue !== 'all') next.set('queue', f.queue);
    if (f.priority !== 'all') next.set('priority', f.priority);
    if (f.control !== 'all') next.set('control', f.control);
    if (f.sort !== 'risk') next.set('sort', f.sort);
    setParams(next, { replace: true });
  };

  const conversations = useMemo(
    () => Object.values(conversationsMap).filter((c) => region === 'all' || c.customer.region === region),
    [conversationsMap, region],
  );
  const regionOptions = [{ value: 'all', label: 'All regions' }, ...(m?.scope.regionList ?? []).map((r) => ({ value: r, label: r }))];
  const k = m?.kpis;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-ink sm:text-[26px]">Dashboard</h1>
          <p className="mt-1 text-[13px] text-muted">
            Live supervision across {m?.scope.queues ?? '–'} queues, {m?.scope.regions ?? '–'} regions, and {m?.scope.agents ?? '–'} AI agents
          </p>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-ink-soft" aria-live="polite" title="Metrics are pushed by the server over Server-Sent Events">
            <span className={cx('size-1.5 rounded-full', status === 'live' ? 'bg-ok pulse-dot' : 'bg-warn')} />
            {status === 'live' && receivedAt ? <>Metrics streaming · updated {clock(receivedAt)} · every 2s</> : status === 'connecting' ? 'Connecting to metrics stream…' : 'Metrics stream reconnecting…'}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2.5 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <PillSelect value={range} onChange={setRange} options={RANGES} className="[&>button]:bg-white [&>button]:shadow-card" />
          <PillSelect value={region} onChange={setRegion} options={regionOptions} align="right" className="[&>button]:bg-white [&>button]:shadow-card" />
          <a href={api.exportUrl(Number(range), region)} download className="col-span-2 inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-800 px-7 text-[15px] font-semibold text-white transition-colors hover:bg-brand-700">
            <Download className="size-4" />Export report
          </a>
        </div>
      </div>

      {!m || !k ? (
        <div className="flex h-40 items-center justify-center"><Spinner /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
            <KpiCard label="Active load" value={(k.activeLoad.value ?? 0).toLocaleString('en-IN')} delta={k.activeLoad.delta} deltaText={k.activeLoad.delta != null ? signedNum(k.activeLoad.delta, '%') : undefined} good="up" caption="live conversations" />
            <KpiCard label="SLA at risk" value={String(k.slaAtRisk.value ?? 0)} delta={k.slaAtRisk.delta} deltaText={k.slaAtRisk.delta != null ? signedNum(k.slaAtRisk.delta) : undefined} good="down" caption="breach in < 10 min or risk ≥ 80" />
            <KpiCard label="AI containment" value={pct(k.containment.value)} delta={k.containment.delta} deltaText={k.containment.delta != null ? signedNum(k.containment.delta, '%') : undefined} good="up" caption={`resolution rate · ${k.containment.resolved} resolved`} />
            <KpiCard label="Avg. handle time" value={k.avgHandleSec.value == null ? '—' : duration(k.avgHandleSec.value * 1000)} delta={k.avgHandleSec.delta} deltaText={k.avgHandleSec.delta != null ? signedDur(k.avgHandleSec.delta) : undefined} good="down" caption={`first response ${k.firstResponseSec.value == null ? '—' : duration(k.firstResponseSec.value * 1000)}`} />
            <KpiCard label="CSAT" value={k.csat.value == null ? '—' : k.csat.value.toFixed(1)} delta={k.csat.delta} deltaText={k.csat.delta != null ? signedNum(k.csat.delta) : undefined} good="up" caption={`satisfaction /10 · ${k.csat.responses} surveys`} />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)_minmax(0,0.95fr)]">
            <Card className="p-4 sm:p-5 lg:col-span-2 xl:col-span-1">
              <CardHeader title="Conversation volume & SLA exposure" subtitle={`Live load vs SLA exposure • ${m.series.bucketMin < 1 ? `${Math.round(m.series.bucketMin * 60)}-second` : `${m.series.bucketMin}-minute`} resolution`} />
              <div className="mt-3"><VolumeChart series={m.series} /></div>
              <div className="mt-2 flex gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-900"><span className="size-2 rounded-full bg-brand-800" />Live</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1 text-xs font-semibold text-warn-ink"><span className="size-2 rounded-full bg-warn" />SLA exposure</span>
              </div>
            </Card>
            <QueueHealth queues={m.queues} selected={filters.queue} onSelect={(q) => setFilters({ ...filters, queue: q })} />
            <CriticalSignals />
          </div>
        </>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <PriorityQueue conversations={conversations} filters={filters} onFilters={setFilters} />
        <LiveFeed />
      </div>
    </div>
  );
}
