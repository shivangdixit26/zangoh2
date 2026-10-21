import { Headset, Search, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Composer, applyInsertedTemplate, type ComposerState } from '../components/conversation/Composer';
import { CopilotCard } from '../components/conversation/Copilot';
import { CustomerPanel } from '../components/conversation/CustomerPanel';
import { ReturnToAiModal } from '../components/conversation/ReturnToAiModal';
import { Thread } from '../components/conversation/Thread';
import { TemplatePickerModal } from '../components/templates/TemplatePickerModal';
import { Avatar, Badge, Button, Empty, PriorityBadge, Segmented, Spinner } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { cx, duration, initials, QUEUE_LABEL, shortName } from '../lib/format';
import { useNow } from '../lib/hooks';
import { attempt, useLive } from '../store/live';
import type { Alert, ConversationSummary } from '../types';

type ListTab = 'open' | 'mine' | 'escalated' | 'resolved';

function ConversationList({ selectedId }: { selectedId?: string }) {
  const navigate = useNavigate();
  const now = useNow();
  const supervisor = useLive((s) => s.supervisor);
  const map = useLive((s) => s.conversations);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<ListTab>('open');

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return Object.values(map)
      .filter((c) => (tab === 'resolved' ? c.status === 'resolved' : c.status !== 'resolved')
        && (tab !== 'mine' || (c.control === 'supervisor' && c.supervisor === supervisor))
        && (tab !== 'escalated' || c.status === 'escalated')
        && (!needle || [c.customer.name, c.caseNumber, c.topic].some((s) => s.toLowerCase().includes(needle))))
      .sort((a, b) => (tab === 'resolved' ? (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0) : b.risk - a.risk));
  }, [map, q, tab, supervisor]);

  return (
    <div className="flex min-h-0 flex-col">
      <h2 className="px-1 text-[17px] text-ink">Customer Conversations</h2>
      <label className="relative mt-3 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer or case..." aria-label="Search conversations" className="h-10 w-full rounded-xl border border-transparent bg-white pl-9 pr-3 text-[13px] shadow-card outline-none placeholder:text-[#c4c1d0] focus:border-brand-300" />
      </label>
      <div className="mt-3">
        <Segmented<ListTab> size="sm" value={tab} onChange={setTab} options={[{ value: 'open', label: 'Open' }, { value: 'mine', label: 'Mine' }, { value: 'escalated', label: 'Escalated' }, { value: 'resolved', label: 'Resolved' }]} />
      </div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto pb-2 pr-1 scroll-thin">
        {!items.length && <Empty title="Nothing here" body={tab === 'mine' ? 'Conversations you take over appear here.' : undefined} />}
        {items.map((c) => (
          <button
            key={c.id}
            onClick={() => navigate(`/conversations/${c.id}`)}
            className={cx('rounded-2xl border bg-white px-3.5 py-3 text-left transition-colors', c.id === selectedId ? 'border-brand-400 bg-[#fbfaff] ring-2 ring-brand-100' : 'border-[#d9d4e8] hover:border-brand-300')}
          >
            <div className="flex items-start gap-2.5">
              <Avatar name={c.customer.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-ink">{c.customer.name}</p>
                <p className="truncate text-[11px] text-muted">{c.topic}</p>
              </div>
              {c.control === 'supervisor' && (
                <span title={`Handled by ${c.supervisor}`} className={cx('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', c.supervisor === supervisor ? 'bg-brand-800 text-white' : 'bg-brand-50 text-brand-700')}>
                  <Headset className="size-3" />{c.supervisor === supervisor ? 'You' : initials(c.supervisor ?? '')}
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between">
              {c.status === 'resolved' ? <Badge tone="ok" className="px-3.5 py-1">Resolved</Badge> : <PriorityBadge priority={c.priority} />}
              <span className="text-[11px] tabular-nums text-ink-soft">{c.status === 'resolved' ? `CSAT ${c.csat ?? '—'}` : duration(now - c.startedAt)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function AlertBanner({ conv, alerts }: { conv: ConversationSummary; alerts: Alert[] }) {
  const now = useNow();
  if (!alerts.length || conv.status === 'resolved') return null;
  const sla = alerts.find((a) => a.rule === 'sla');
  const slaLeft = conv.slaDueAt - now;
  const primary = sla ? (slaLeft > 0 ? `SLA breach likely in ${duration(slaLeft)}` : `SLA breached ${duration(-slaLeft)} ago`) : alerts[0].title;
  const others = alerts.filter((a) => a !== (sla ?? alerts[0]));
  const critical = alerts.some((a) => a.severity === 'critical');
  const reason = conv.aiConfidence < 0.65 && conv.control === 'ai'
    ? `AI confidence fell to ${Math.round(conv.aiConfidence * 100)}%${conv.refundAmount ? ' after a policy exception request' : ''}`
    : others.map((a) => a.title).join(' • ') || alerts[0].detail;
  return (
    <div role="status" className={cx('flex items-start gap-3 rounded-xl px-4 py-3', critical && slaLeft <= 0 ? 'bg-critical-soft' : 'bg-warn-soft')}>
      <span className={cx('mt-1.5 size-2.5 shrink-0 rounded-full', critical ? 'bg-warn pulse-dot' : 'bg-warn')} />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold tabular-nums text-ink">{primary}</p>
        <p className="text-[11.5px] text-ink-soft">{reason}{others.length > 0 && reason !== others.map((a) => a.title).join(' • ') ? ` • ${others.map((a) => a.title).join(' • ')}` : ''}</p>
      </div>
    </div>
  );
}

export default function Conversations() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const supervisor = useLive((s) => s.supervisor);
  const map = useLive((s) => s.conversations);
  const messages = useLive((s) => (id ? s.messages[id] : undefined));
  const alertsMap = useLive((s) => s.alerts);
  const setMessages = useLive((s) => s.setMessages);
  const upsert = useLive((s) => s.upsertConversation);
  const [composer, setComposer] = useState<ComposerState>({ text: '', template: null });
  const [picker, setPicker] = useState<{ open: boolean; templateId: string | null }>({ open: false, templateId: null });
  const [returnOpen, setReturnOpen] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [missing, setMissing] = useState(false);

  const conv = id ? map[id] : undefined;

  // Load the full thread (and the summary, in case it's an older resolved conversation not in the live list).
  useEffect(() => {
    if (!id) return;
    setMissing(false);
    setComposer({ text: '', template: null });
    api.conversation(id)
      .then((d) => { const { messages: msgs, ...summary } = d; setMessages(id, msgs); upsert(summary); })
      .catch((e) => { if (e instanceof ApiError && e.status === 404) setMissing(true); });
  }, [id, setMessages, upsert]);

  // Deep links from the dashboard / templates screen: ?templates=1 or ?template=<id>
  useEffect(() => {
    const tpl = params.get('template');
    if (tpl || params.get('templates')) {
      setPicker({ open: true, templateId: tpl });
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const convAlerts = useMemo(() => Object.values(alertsMap)
    .filter((a) => a.conversationId === id && a.status !== 'cleared')
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1)), [alertsMap, id]);

  if (!id) {
    const top = Object.values(map).filter((c) => c.status !== 'resolved').sort((a, b) => b.risk - a.risk)[0];
    return top ? <Navigate to={`/conversations/${top.id}`} replace /> : <Empty title="No open conversations" body="New conversations appear here in real time." />;
  }

  const iControl = conv?.control === 'supervisor' && conv.supervisor === supervisor;
  const lockedByOther = conv?.control === 'supervisor' && conv.supervisor !== supervisor;

  const takeOver = async () => {
    if (!conv) return;
    setTakingOver(true);
    await attempt(() => api.takeOver(conv.id), 'You are now in control. The AI is paused.');
    setTakingOver(false);
  };

  return (
    <div className="grid h-auto grid-cols-1 gap-5 lg:h-[calc(100vh-104px)] lg:grid-cols-[272px_minmax(0,1fr)_290px] 2xl:grid-cols-[290px_minmax(0,1fr)_330px]">
      <div className="max-h-[420px] min-h-0 lg:max-h-none"><ConversationList selectedId={id} /></div>

      <section className="card flex min-h-[640px] flex-col px-3 py-3 sm:px-4 lg:min-h-0">
        {missing ? (
          <Empty title="Conversation not found" body="It may have been removed by a data reset." className="m-auto" />
        ) : !conv || !messages ? (
          <div className="m-auto"><Spinner /></div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#faf8fc] px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={conv.customer.name} />
                <div className="min-w-0">
                  <h1 className="truncate text-[17px] font-semibold text-ink">{conv.customer.name} · Case #{conv.caseNumber}</h1>
                  <p className="truncate text-[11.5px] text-muted">{QUEUE_LABEL[conv.queue] ?? conv.queue} • {conv.channel} • {conv.customer.language} • {conv.customer.tier} tier</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {conv.status === 'resolved'
                  ? <Badge tone="ok" className="px-3 py-1">Resolved</Badge>
                  : <Badge tone={conv.priority === 'critical' ? 'critical' : conv.priority === 'high' ? 'warn' : conv.priority === 'watch' ? 'info' : 'neutral'} dot className="px-3 py-1 capitalize">{conv.priority}</Badge>}
                {conv.status !== 'resolved' && (
                  iControl ? (
                    <Button variant="secondary" onClick={() => setReturnOpen(true)}>Return to AI</Button>
                  ) : lockedByOther ? (
                    <Button variant="secondary" disabled title="Another supervisor holds this conversation"><UserRound className="size-4" />Handled by {shortName(conv.supervisor ?? '')}</Button>
                  ) : (
                    <Button onClick={takeOver} loading={takingOver} className="px-5">Take over</Button>
                  )
                )}
              </div>
            </div>

            {iControl && (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-brand-800 px-4 py-2 text-xs text-white">
                <Headset className="size-4" />
                You're in control. The AI agent is paused until you return the conversation.
              </div>
            )}
            <div className="mt-2"><AlertBanner conv={conv} alerts={convAlerts} /></div>

            <Thread conv={conv} messages={messages} />

            {conv.status !== 'resolved' && !lockedByOther && (
              <div className="mb-3">
                <CopilotCard conv={conv} onEdit={(text) => setComposer({ text, template: null })} />
              </div>
            )}
            <Composer
              conv={conv}
              state={composer}
              onChange={setComposer}
              onOpenTemplates={() => setPicker({ open: true, templateId: null })}
            />
          </>
        )}
      </section>

      {conv && !missing ? <CustomerPanel conv={conv} /> : <div className="card hidden lg:block" />}

      {conv && (
        <>
          <TemplatePickerModal
            open={picker.open}
            onClose={() => setPicker({ open: false, templateId: null })}
            conversation={conv}
            initialTemplateId={picker.templateId}
            onInsert={(r) => setComposer(applyInsertedTemplate(r))}
          />
          <ReturnToAiModal open={returnOpen} onClose={() => setReturnOpen(false)} conv={conv} />
        </>
      )}
    </div>
  );
}
