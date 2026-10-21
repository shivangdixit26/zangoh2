import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { AGENT_LABEL, cx, duration, moneyShort, signed, timeAgo } from '../../lib/format';
import { useNow } from '../../lib/hooks';
import { attempt, useLive } from '../../store/live';
import type { ConversationSummary } from '../../types';
import { Avatar, Button, ConfirmModal, ProgressBar } from '../ui';

const DIAGNOSTICS: { key: keyof ConversationSummary['diagnostics']; label: string; color: string }[] = [
  { key: 'repeatContact', label: 'Repeat contact', color: '#dc4c4c' },
  { key: 'negativeSentiment', label: 'Negative sentiment', color: '#e3a336' },
  { key: 'policyException', label: 'Policy exception', color: '#5b86c6' },
  { key: 'churnPropensity', label: 'Churn propensity', color: '#6b55b0' },
];

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={cx('mt-0.5 text-xl font-semibold tabular-nums text-ink', className)}>{value}</p>
    </div>
  );
}

/** Right column: customer context, risk diagnostics, feedback notes and resolution. */
export function CustomerPanel({ conv }: { conv: ConversationSummary }) {
  const now = useNow();
  const supervisor = useLive((s) => s.supervisor);
  const [notes, setNotes] = useState(conv.feedbackNotes);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [confirm, setConfirm] = useState(false);
  const [resolving, setResolving] = useState(false);
  const dirty = useRef(false);

  // Reset only when switching conversations; live updates must not clobber what the supervisor is typing.
  useEffect(() => { setNotes(conv.feedbackNotes); dirty.current = false; setSaved('idle'); }, [conv.id]);

  // Autosave feedback notes shortly after the supervisor stops typing.
  useEffect(() => {
    if (!dirty.current) return undefined;
    setSaved('saving');
    const t = setTimeout(() => {
      api.saveNotes(conv.id, notes).then(() => setSaved('saved')).catch(() => setSaved('idle'));
    }, 700);
    return () => clearTimeout(t);
  }, [notes, conv.id]);

  const c = conv.customer;
  const lockedByOther = conv.control === 'supervisor' && conv.supervisor !== supervisor;
  const slaLeft = conv.slaDueAt - now;

  const resolve = async () => {
    setResolving(true);
    await attempt(() => api.resolve(conv.id, notes), `Case #${conv.caseNumber} resolved`);
    setResolving(false);
    setConfirm(false);
  };

  return (
    <aside className="card flex min-h-0 flex-col overflow-auto p-5 scroll-thin">
      <h2 className="text-[17px] font-semibold text-ink">Customer intelligence</h2>
      <div className="mt-4 flex items-start gap-3">
        <Avatar name={c.name} />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink">{c.name} · Case #{conv.caseNumber}</p>
          <p className="text-xs text-muted">{c.tier} • {c.tenureYears} years • {c.location}</p>
        </div>
      </div>
      <hr className="my-4 border-line" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Stat label="Lifetime value" value={moneyShort(c.lifetimeValue)} />
        <Stat label="Orders" value={String(c.orders)} />
        <Stat label="Return rate" value={`${(c.returnRate * 100).toFixed(1)}%`} />
        <Stat label="Sentiment" value={signed(conv.sentiment)} className={conv.sentiment < -0.1 ? 'text-critical-ink' : conv.sentiment > 0.2 ? 'text-ok-ink' : ''} />
      </div>
      <hr className="my-4 border-line" />
      <h3 className="text-[15px] font-semibold text-ink">Case diagnostics</h3>
      <p className="text-[11px] text-muted">Signals contributing to risk ({conv.risk}/100)</p>
      <div className="mt-3 flex flex-col gap-3">
        {DIAGNOSTICS.map((d) => (
          <div key={d.key}>
            <div className="mb-1 flex justify-between text-[11px] text-ink-soft"><span>{d.label}</span><span className="tabular-nums">{Math.round(conv.diagnostics[d.key] * 100)}%</span></div>
            <ProgressBar value={conv.diagnostics[d.key] * 100} color={d.color} />
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[#f8f6fb] p-3 text-[11px] text-ink-soft">
        <span>AI agent</span><span className="text-right font-medium text-ink">{AGENT_LABEL[conv.agentId] ?? conv.agentId}</span>
        <span>AI confidence</span><span className={cx('text-right font-medium', conv.aiConfidence < 0.65 ? 'text-critical-ink' : 'text-ink')}>{Math.round(conv.aiConfidence * 100)}%</span>
        <span>SLA</span><span className={cx('text-right font-medium tabular-nums', slaLeft < 5 * 60_000 ? 'text-critical-ink' : 'text-ink')}>{conv.status === 'resolved' ? 'met' : slaLeft > 0 ? `${duration(slaLeft)} left` : `breached ${duration(-slaLeft)}`}</span>
        {conv.orderId && <><span>Order</span><span className="text-right font-medium text-ink">{conv.orderId}</span></>}
      </div>
      {conv.handoffNotes.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Handoff notes</p>
          {conv.handoffNotes.slice(-3).map((n) => (
            <p key={n.ts} className="mt-1.5 rounded-lg bg-[#f8f6fb] px-2.5 py-1.5 text-[11.5px] text-ink-soft">
              {n.text}<span className="block text-[10px] text-muted">{n.author} · {timeAgo(n.ts, now)} · {n.sharedWithAi ? 'shared with AI' : 'internal only'}</span>
            </p>
          ))}
        </div>
      )}
      <div className="mt-5 flex flex-1 flex-col">
        <label htmlFor="feedback-notes" className="flex items-center justify-between text-[13px] text-muted">
          Feedback Notes
          <span className="text-[10px]">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : ''}</span>
        </label>
        <textarea
          id="feedback-notes"
          value={notes}
          onChange={(e) => { dirty.current = true; setNotes(e.target.value); }}
          placeholder="Write here..."
          className="mt-2 min-h-[150px] flex-1 resize-none rounded-2xl bg-note p-4 text-[13px] text-ink outline-none placeholder:text-ink-soft/50 focus:ring-2 focus:ring-warn/40"
        />
      </div>
      <Button
        size="lg"
        className="mt-4 h-12 w-full rounded-2xl font-normal"
        disabled={conv.status === 'resolved' || lockedByOther}
        onClick={() => setConfirm(true)}
      >
        {conv.status === 'resolved' ? `Resolved${conv.resolvedBy ? ` by ${conv.resolvedBy === 'ai' ? 'AI' : 'supervisor'}` : ''}` : 'Mark as Resolved'}
      </Button>
      <ConfirmModal
        open={confirm}
        title={`Resolve case #${conv.caseNumber}?`}
        body={<>The conversation closes for {c.name.split(' ')[0]} and a satisfaction survey is sent. Your feedback notes are saved with the case.</>}
        confirmLabel="Mark as resolved"
        loading={resolving}
        onConfirm={resolve}
        onClose={() => setConfirm(false)}
      />
    </aside>
  );
}
