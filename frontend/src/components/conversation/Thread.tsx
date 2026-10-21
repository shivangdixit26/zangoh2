import { BookOpen, Lock, Mic, Scissors } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { AGENT_LABEL, clockShort, cx } from '../../lib/format';
import type { ConversationSummary, Message } from '../../types';

function MessageBubble({ m, agentLabel }: { m: Message; agentLabel: string }) {
  if (m.role === 'system') {
    return (
      <div className="flex items-center gap-3 py-1 text-[11px] text-muted">
        <span className="h-px flex-1 bg-line" />
        <span className="max-w-[70%] text-center">{m.text} · {clockShort(m.ts)}</span>
        <span className="h-px flex-1 bg-line" />
      </div>
    );
  }
  if (m.role === 'note') {
    return (
      <div className="ml-auto w-fit max-w-[70%] rounded-2xl border border-[#f2d66b] bg-note/70 px-4 py-3">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-warn-ink"><Lock className="size-3" />Internal note · {m.author} · {clockShort(m.ts)}</p>
        <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink">{m.text}</p>
        <p className="mt-1 text-[10px] text-warn-ink/80">Not visible to the customer</p>
      </div>
    );
  }
  const isCustomer = m.role === 'customer';
  const isSupervisor = m.role === 'supervisor';
  const label = isCustomer ? 'Customer' : isSupervisor ? `Supervisor · ${m.author ?? ''}` : `AI agent${m.author ? ` · ${m.author}` : ` · ${agentLabel}`}`;
  return (
    <div className={cx('flex', isCustomer ? 'justify-start' : 'justify-end')}>
      <div className={cx(
        'max-w-[78%] rounded-2xl px-4 py-3 md:max-w-[64%]',
        isCustomer && 'bg-[#f4f1f8]',
        m.role === 'ai' && 'bg-brand-100',
        isSupervisor && 'border border-brand-300 bg-white shadow-card',
      )}>
        <p className={cx('text-[10px] font-semibold uppercase tracking-wide', isSupervisor ? 'text-brand-700' : 'text-ink-soft/80')}>
          {label} · {clockShort(m.ts)}
        </p>
        <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{m.text}</p>
        {(m.meta?.templateName || m.meta?.source === 'voice' || m.meta?.citations?.length || m.meta?.finishReason === 'length' || m.meta?.confidence != null) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {m.meta?.source === 'voice' && <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700"><Mic className="size-3" />Sent by voice</span>}
            {m.meta?.templateName && <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">Template: {m.meta.templateName}</span>}
            {m.meta?.citations?.map((c) => <span key={c.id} title={c.title} className="inline-flex items-center gap-1 rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-ink-soft"><BookOpen className="size-3" />{c.id}</span>)}
            {m.meta?.finishReason === 'length' && <span className="inline-flex items-center gap-1 rounded-md bg-warn-soft px-1.5 py-0.5 text-[10px] font-medium text-warn-ink"><Scissors className="size-3" />Truncated by max tokens</span>}
            {m.role === 'ai' && m.meta?.confidence != null && <span className={cx('rounded-md px-1.5 py-0.5 text-[10px] font-medium', m.meta.confidence < 0.65 ? 'bg-critical-soft text-critical-ink' : 'bg-white/70 text-ink-soft')}>Confidence {Math.round(m.meta.confidence * 100)}%</span>}
          </div>
        )}
        {m.meta?.cta && <div className="mt-2"><span className="inline-block rounded-lg bg-brand-800 px-3 py-1 text-[11px] font-semibold text-white">{m.meta.cta}</span></div>}
      </div>
    </div>
  );
}

export function Thread({ conv, messages }: { conv: ConversationSummary; messages: Message[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const visible = messages.filter((m) => m.role !== 'system' && m.role !== 'note');
  const last = visible[visible.length - 1];
  const typing = conv.status !== 'resolved' && conv.control === 'ai' && last?.role === 'customer';

  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, typing]);

  return (
    <div
      ref={ref}
      onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; }}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-1 py-4 scroll-thin"
      aria-live="polite"
    >
      <div className="flex-1" />
      {messages.map((m) => <MessageBubble key={m.id} m={m} agentLabel={AGENT_LABEL[conv.agentId] ?? conv.agentId} />)}
      {typing && (
        <div className="flex justify-end">
          <div className="flex items-center gap-1.5 rounded-2xl bg-brand-100 px-4 py-3 text-xs text-ink-soft">
            <span className="typing-dot size-1.5 rounded-full bg-brand-600" />
            <span className="typing-dot size-1.5 rounded-full bg-brand-600 [animation-delay:150ms]" />
            <span className="typing-dot size-1.5 rounded-full bg-brand-600 [animation-delay:300ms]" />
            <span className="ml-1">AI agent is replying…</span>
          </div>
        </div>
      )}
    </div>
  );
}
