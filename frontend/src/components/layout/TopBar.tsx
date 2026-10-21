import { Bell, BriefcaseBusiness, Check, CheckCheck, MessageSquare, Search, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { cx, initials, timeAgo } from '../../lib/format';
import { useClickOutside, useDebounced, useNow } from '../../lib/hooks';
import { attempt, useLive } from '../../store/live';
import { alertLink } from '../dashboard/widgets';
import { Badge, Empty, PriorityBadge } from '../ui';

type SearchResults = Awaited<ReturnType<typeof api.search>>;

function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const debounced = useDebounced(q, 180);
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);

  useEffect(() => {
    if (debounced.trim().length < 2) { setResults(null); return; }
    let cancelled = false;
    api.search(debounced).then((r) => { if (!cancelled) setResults(r); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [debounced]);

  // "/" focuses search from anywhere, like most ops consoles.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); inputRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const go = (href: string) => { navigate(href); setOpen(false); setQ(''); };
  const first = results?.conversations[0] ? `/conversations/${results.conversations[0].id}` : results?.agents[0] ? `/agents/${results.agents[0].id}` : results?.templates[0] ? `/templates?focus=${results.templates[0].id}` : null;
  const empty = results && !results.conversations.length && !results.agents.length && !results.templates.length;

  return (
    <div ref={ref} className="sm:relative sm:w-full sm:max-w-[280px]">
      {/* Phones: the search collapses to an icon and expands into a full-width bar under the header. */}
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        aria-label="Open search"
        className={cx('inline-flex size-10 items-center justify-center rounded-xl text-white/90 hover:bg-white/10 sm:hidden', open && 'hidden')}
      >
        <Search className="size-5" />
      </button>
      <div className={cx(open ? 'fixed inset-x-0 top-16 z-40 bg-brand-900 px-3 pb-3' : 'hidden', 'sm:static sm:block sm:bg-transparent sm:p-0')}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/60" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' && first) go(first); }}
            placeholder="Search conversations, agents..."
            aria-label="Search conversations, agents and templates"
            className="h-10 w-full rounded-xl bg-white/12 pl-10 pr-3 text-sm text-white placeholder:text-white/70 outline-none ring-0 transition-colors focus:bg-white/20"
          />
        </div>
      </div>
      {open && q.trim().length >= 2 && (
        <div className="slide-in fixed inset-x-3 top-[124px] z-50 overflow-hidden rounded-2xl border border-line bg-white p-2 text-ink shadow-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[360px]">
          {!results && <p className="px-3 py-4 text-sm text-muted">Searching…</p>}
          {empty && <Empty title="No matches" body="Try a customer name, case number or agent." className="py-6" />}
          {results?.conversations.map((c) => (
            <button key={c.id} onClick={() => go(`/conversations/${c.id}`)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-brand-50">
              <MessageSquare className="size-4 text-brand-600" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{c.name} · #{c.caseNumber}</span><span className="block truncate text-xs text-muted">{c.topic} · {c.status}</span></span>
              {c.status !== 'resolved' && <PriorityBadge priority={c.priority as never} className="px-2 py-0" />}
            </button>
          ))}
          {results?.agents.map((a) => (
            <button key={a.id} onClick={() => go(`/agents/${a.id}`)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-brand-50">
              <BriefcaseBusiness className="size-4 text-brand-600" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{a.name} v{a.version}</span><span className="block truncate text-xs text-muted">{a.description}</span></span>
            </button>
          ))}
          {results?.templates.map((t) => (
            <button key={t.id} onClick={() => go(`/templates?focus=${t.id}`)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-brand-50">
              <Zap className="size-4 text-brand-600" />
              <span className="text-sm font-medium">{t.name}</span><span className="text-xs text-muted">{t.category} template</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);
  const alertsMap = useLive((s) => s.alerts);
  const now = useNow();
  const alerts = useMemo(() => Object.values(alertsMap).filter((a) => a.status !== 'cleared')
    .sort((a, b) => (a.status === b.status ? (a.severity === b.severity ? b.createdAt - a.createdAt : a.severity === 'critical' ? -1 : 1) : a.status === 'open' ? -1 : 1)), [alertsMap]);
  const openCount = alerts.filter((a) => a.status === 'open').length;
  const criticalOpen = alerts.some((a) => a.status === 'open' && a.severity === 'critical');

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label={`Alerts, ${openCount} open`} className="relative inline-flex size-10 items-center justify-center rounded-xl text-white/90 hover:bg-white/10">
        <Bell className="size-5" />
        {openCount > 0 && (
          <span className={cx('absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold', criticalOpen ? 'bg-critical text-white' : 'bg-warn text-ink')}>
            {openCount}
          </span>
        )}
      </button>
      {open && (
        <div className="slide-in fixed inset-x-3 top-[68px] z-50 overflow-hidden rounded-2xl border border-line bg-white text-ink shadow-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[400px]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Alerts</p>
              <p className="text-xs text-muted">{openCount} open · {alerts.length - openCount} acknowledged</p>
            </div>
            <button disabled={!openCount} onClick={() => attempt(() => api.ackAll(), 'All alerts acknowledged')} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline disabled:text-muted disabled:no-underline">
              <CheckCheck className="size-4" />Acknowledge all
            </button>
          </div>
          <div className="max-h-[420px] overflow-auto p-2 scroll-thin">
            {!alerts.length && <Empty title="All clear" body="No problematic conversations right now." />}
            {alerts.map((a) => (
              <div key={a.id} className={cx('group flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-brand-50', a.status === 'acknowledged' && 'opacity-60')}>
                <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', a.severity === 'critical' ? 'bg-critical' : 'bg-warn')} />
                <Link to={alertLink(a)} onClick={() => setOpen(false)} className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{a.title}</p>
                  <p className="truncate text-xs text-muted">{a.detail}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{timeAgo(a.createdAt, now)}{a.acknowledgedBy ? ` · ack by ${a.acknowledgedBy}` : ''}</p>
                </Link>
                {a.status === 'open' ? (
                  <button onClick={() => attempt(() => api.ackAlert(a.id))} title="Acknowledge" aria-label="Acknowledge alert" className="rounded-lg p-1 text-muted opacity-0 hover:bg-white hover:text-ok-ink group-hover:opacity-100 focus:opacity-100">
                    <Check className="size-4" />
                  </button>
                ) : <Badge tone="neutral" className="text-[10px]">Ack</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const supervisor = useLive((s) => s.supervisor);
  const connected = useLive((s) => s.connected);
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 bg-brand-900 px-4 sm:px-8">
      <Link to="/" className="text-lg font-semibold tracking-tight text-white">ABC Company</Link>
      <div className="flex flex-1 items-center justify-end gap-3">
        <span className={cx('hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex', connected ? 'bg-white/10 text-white/90' : 'bg-warn text-ink')} title={connected ? 'Receiving live updates' : 'Reconnecting to the live feed'}>
          <span className={cx('size-1.5 rounded-full', connected ? 'bg-[#6fe39a] pulse-dot' : 'bg-ink')} />
          {connected ? 'Live' : 'Reconnecting…'}
        </span>
        <GlobalSearch />
        <AlertsMenu />
        <Link to="/settings" title={`Signed in as ${supervisor}`} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-peach text-sm font-bold text-peach-ink">
          {initials(supervisor)}
        </Link>
      </div>
    </header>
  );
}
