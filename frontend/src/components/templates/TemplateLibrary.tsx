import { ArrowRight, Lock, Pencil, Search, Star, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { cx } from '../../lib/format';
import { attempt, useLive } from '../../store/live';
import type { Template } from '../../types';
import { Empty, PillSelect, Segmented } from '../ui';

/** Scenario categories (the brief's "shipping, returns, etc."); supervisors can also add their own. */
export const CATEGORY_DOT: Record<string, string> = {
  Shipping: '#4ea3e8', Returns: '#e8556a', Billing: '#1ea6e0', Account: '#e3a336', Product: '#14b8a6', Onboarding: '#7a63d8', Engagement: '#3fae6a', General: '#8a8797',
};
export const DEFAULT_CATEGORIES = Object.keys(CATEGORY_DOT);
const CUSTOM_DOTS = ['#c2410c', '#9333ea', '#0f766e', '#be185d', '#4d7c0f'];
export const categoryDot = (c: string) => CATEGORY_DOT[c] ?? CUSTOM_DOTS[[...c].reduce((n, ch) => n + ch.charCodeAt(0), 0) % CUSTOM_DOTS.length];
export const CHANNEL_DOT: Record<string, string> = { Email: '#f0a03a', Website: '#5f6b7a', Mobile: '#1ea6e0', Messenger: '#8b5cf6' };
const CHANNEL_CHIP: Record<string, string> = {
  Website: 'bg-info-soft text-info-ink',
  Messenger: 'bg-ok-soft text-ok-ink',
  Email: 'bg-[#fff1e3] text-[#b0661c]',
  Mobile: 'bg-[#e4f5fc] text-[#1a7fab]',
};
const THUMB: Record<string, { bg: string; dot: string; bar: string }> = {
  Website: { bg: '#f5f3fa', dot: '#d9d1f0', bar: '#e2dcf2' },
  Messenger: { bg: '#f0f6fd', dot: '#cfe3f8', bar: '#dbe9f7' },
  Email: { bg: '#fff6ee', dot: '#fbdcbc', bar: '#f6e3cf' },
  Mobile: { bg: '#eff8f3', dot: '#c7ebd6', bar: '#d6efe1' },
};

export type LibraryFilter = { kind: 'all' } | { kind: 'popular' } | { kind: 'low' } | { kind: 'category'; value: string } | { kind: 'channel'; value: string };
type Tab = 'all' | 'team' | 'recent';
type Sort = 'most_used' | 'recent' | 'az' | 'newest';

const POPULAR = 75;
const LOW_USE = 20;

function matches(t: Template, f: LibraryFilter) {
  switch (f.kind) {
    case 'popular': return t.uses >= POPULAR;
    case 'low': return t.uses < LOW_USE;
    case 'category': return t.category === f.value;
    case 'channel': return t.channels.includes(f.value);
    default: return true;
  }
}

function TemplateCard({ t, selected, onSelect, actions, onEdit, onDelete, onUse }: {
  t: Template; selected: boolean; onSelect: () => void; actions: boolean; onEdit?: () => void; onDelete?: () => void; onUse?: () => void;
}) {
  const thumb = THUMB[t.channels[0]] ?? THUMB.Website;
  return (
    <div className="relative">
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={onSelect}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
        className={cx('h-full rounded-2xl border bg-white p-3.5 text-left transition-all', selected ? 'border-brand-300 shadow-pop' : 'border-line hover:border-brand-200 hover:shadow-card')}
      >
        <div className="relative rounded-xl p-3" style={{ background: thumb.bg }}>
          <div className="flex items-center gap-2">
            <span className="size-3.5 rounded-full" style={{ background: thumb.dot }} />
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="h-1.5 w-1/3 rounded-full" style={{ background: thumb.bar }} />
              <span className="h-1.5 w-3/4 rounded-full" style={{ background: thumb.bar }} />
            </span>
          </div>
          <div className="mt-3 flex h-7 items-center rounded-lg bg-white/80 px-3"><span className="h-1.5 w-2/3 rounded-full" style={{ background: thumb.bar }} /></div>
          <button
            onClick={(e) => { e.stopPropagation(); attempt(() => api.favoriteTemplate(t.id, !t.favorite)); }}
            aria-label={t.favorite ? 'Remove from favourites' : 'Add to favourites'}
            className="absolute right-2.5 top-2.5 rounded p-0.5 hover:bg-white/70"
          >
            <Star className={cx('size-[18px]', t.favorite ? 'fill-brand-500 text-brand-500' : 'text-[#b9b5c6]')} />
          </button>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <span className="truncate">{t.name}</span>
          {t.shared
            ? <span title="Shared with the team" className="inline-flex items-center gap-0.5 rounded bg-ok-soft px-1.5 py-px text-[10px] font-medium text-ok-ink"><Users className="size-3" />Team</span>
            : <span title="Private: only you can see this template" className="inline-flex items-center gap-0.5 rounded bg-[#f1f0f4] px-1.5 py-px text-[10px] font-medium text-ink-soft"><Lock className="size-3" />Private</span>}
        </p>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted">{t.title}</p>
        <div className="mt-2.5 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 ring-1 ring-brand-100">
            <span className="size-1.5 rounded-full" style={{ background: categoryDot(t.category) }} />{t.category}
          </span>
          {t.channels.slice(0, 2).map((c) => <span key={c} className={cx('rounded-md px-2 py-0.5 text-[11px] font-medium', CHANNEL_CHIP[c] ?? CHANNEL_CHIP.Website)}>{c}</span>)}
          <span className="ml-auto whitespace-nowrap text-[11px] text-muted">{t.uses} uses</span>
        </div>
      </div>
      {actions && selected && (
        <div className="slide-in absolute -bottom-12 left-1/2 z-10 flex -translate-x-1/2 gap-4">
          <button onClick={onDelete} disabled={!t.canEdit} aria-label={`Delete ${t.name}`} title={t.canEdit ? 'Delete' : `Only ${t.createdBy} can delete this template`} className="inline-flex size-10 items-center justify-center rounded-full bg-[#ecebf0] text-critical hover:bg-critical-soft disabled:opacity-40"><Trash2 className="size-4" /></button>
          <button onClick={onEdit} disabled={!t.canEdit} aria-label={`Edit ${t.name}`} title={t.canEdit ? 'Edit' : `Only ${t.createdBy} can edit this template`} className="inline-flex size-10 items-center justify-center rounded-full bg-[#ecebf0] text-info hover:bg-info-soft disabled:opacity-40"><Pencil className="size-4" /></button>
          <button onClick={onUse} aria-label={`Use ${t.name}`} title="Use in a conversation" className="inline-flex size-10 items-center justify-center rounded-full bg-[#ecebf0] text-ok hover:bg-ok-soft"><ArrowRight className="size-4" /></button>
        </div>
      )}
    </div>
  );
}

/** Sidebar + searchable grid. Used by the Templates screen (with card actions) and the in-chat picker. */
export function TemplateLibrary({ templates, selectedId, onSelect, actions = false, onEdit, onDelete, onUse, compact = false }: {
  templates: Template[];
  selectedId: string | null;
  onSelect: (t: Template) => void;
  actions?: boolean;
  onEdit?: (t: Template) => void;
  onDelete?: (t: Template) => void;
  onUse?: (t: Template) => void;
  compact?: boolean;
}) {
  const supervisor = useLive((s) => s.supervisor);
  const [filter, setFilter] = useState<LibraryFilter>({ kind: 'all' });
  const [catQuery, setCatQuery] = useState('');
  const [q, setQ] = useState('');
  const [channel, setChannel] = useState('all');
  const [sort, setSort] = useState<Sort>('most_used');
  const [tab, setTab] = useState<Tab>('all');

  const order = (c: string) => (DEFAULT_CATEGORIES.includes(c) ? DEFAULT_CATEGORIES.indexOf(c) : 100);
  const categories = useMemo(() => [...new Set(templates.map((t) => t.category))].sort((a, b) => order(a) - order(b) || a.localeCompare(b)), [templates]);
  const channels = useMemo(() => [...new Set(templates.flatMap((t) => t.channels))].sort((a, b) => Object.keys(CHANNEL_DOT).indexOf(a) - Object.keys(CHANNEL_DOT).indexOf(b)), [templates]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const weekAgo = Date.now() - 7 * 86_400_000;
    const list = templates.filter((t) => matches(t, filter)
      && (channel === 'all' || t.channels.includes(channel))
      && (tab === 'all' || (tab === 'team' ? t.shared : (t.lastUsedAt ?? 0) >= weekAgo))
      && (!needle || [t.name, t.title, t.content, t.category, t.type, ...t.channels].some((s) => s.toLowerCase().includes(needle))));
    return list.sort((a, b) => {
      if (tab === 'recent' || sort === 'recent') return (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0);
      if (sort === 'az') return a.name.localeCompare(b.name);
      if (sort === 'newest') return b.createdAt - a.createdAt;
      return Number(b.favorite) - Number(a.favorite) || b.uses - a.uses;
    });
  }, [templates, filter, channel, tab, q, sort, supervisor]);

  const navItem = (f: LibraryFilter, label: string, dot: string, count?: number) => {
    const active = JSON.stringify(f) === JSON.stringify(filter);
    if (catQuery && !label.toLowerCase().includes(catQuery.toLowerCase())) return null;
    return (
      <button key={label} onClick={() => setFilter(f)} className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] transition-colors', active ? 'bg-[#f4f1ff] font-semibold text-brand-700' : 'text-ink hover:bg-brand-50')}>
        <span className="size-2 rounded-full" style={{ background: dot }} />
        <span className="flex-1">{label}</span>
        {count != null && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">{count}</span>}
      </button>
    );
  };

  return (
    <div className={cx('grid min-h-0 flex-1', compact ? 'grid-cols-[212px_minmax(0,1fr)]' : 'grid-cols-1 md:grid-cols-[210px_minmax(0,1fr)]')}>
      <aside className="flex min-h-0 flex-col gap-1 overflow-auto border-r border-line px-3 py-5 scroll-thin">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-ink">Template library</p>
        <label className="relative my-2 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input value={catQuery} onChange={(e) => setCatQuery(e.target.value)} placeholder="Search categories" className="h-9 w-full rounded-xl border border-line bg-[#fbfafd] pl-9 pr-2 text-[13px] outline-none focus:border-brand-300" />
        </label>
        {navItem({ kind: 'all' }, 'All templates', '#7a63d8', templates.length)}
        {navItem({ kind: 'popular' }, 'Popular', '#f0a03a')}
        {navItem({ kind: 'low' }, 'Low use', '#9a97a8')}
        <hr className="my-2 border-line" />
        <p className="px-1 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft">By category</p>
        {categories.map((c) => navItem({ kind: 'category', value: c }, c, categoryDot(c), templates.filter((t) => t.category === c).length))}
        <p className="px-1 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-wide text-ink-soft">By channel</p>
        {channels.map((c) => navItem({ kind: 'channel', value: c }, c, CHANNEL_DOT[c] ?? '#999'))}
      </aside>

      <div className="flex min-h-0 flex-col px-5 py-5">
        <h2 className="text-xl font-semibold text-ink">Response Templates</h2>
        <p className="mt-0.5 text-[13px] text-muted">Choose a reply and customize it before inserting.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, message, or tag" aria-label="Search templates" className="h-10 w-full rounded-xl border border-line bg-white pl-9 pr-3 text-[13px] outline-none focus:border-brand-300" />
          </label>
          <PillSelect variant="field" value={channel} onChange={setChannel} className="w-36" options={[{ value: 'all', label: 'All channels' }, ...channels.map((c) => ({ value: c, label: c }))]} />
          <PillSelect<Sort> variant="field" value={sort} onChange={setSort} align="right" className="w-36" options={[{ value: 'most_used', label: 'Most used' }, { value: 'recent', label: 'Recently used' }, { value: 'az', label: 'A–Z' }, { value: 'newest', label: 'Newest' }]} />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <Segmented<Tab> size="sm" value={tab} onChange={setTab} options={[{ value: 'all', label: 'All templates' }, { value: 'team', label: 'My team' }, { value: 'recent', label: 'Recently used' }]} />
          <span className="text-xs text-muted">{results.length} result{results.length === 1 ? '' : 's'}</span>
        </div>
        <div className={cx('mt-4 grid min-h-0 flex-1 auto-rows-max grid-cols-1 overflow-auto pb-14 pr-1 scroll-thin sm:grid-cols-2', actions ? 'gap-x-4 gap-y-16' : 'gap-4')}>
          {results.map((t) => (
            <TemplateCard
              key={t.id}
              t={t}
              selected={t.id === selectedId}
              onSelect={() => onSelect(t)}
              actions={actions}
              onEdit={() => onEdit?.(t)}
              onDelete={() => onDelete?.(t)}
              onUse={() => onUse?.(t)}
            />
          ))}
          {!results.length && <Empty className="col-span-full" title="No templates match" body="Clear the filters or create a new template." />}
        </div>
      </div>
    </div>
  );
}
