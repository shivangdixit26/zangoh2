import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { cx, initials } from '../lib/format';
import { useClickOutside } from '../lib/hooks';
import { useLive } from '../store/live';
import type { Priority } from '../types';

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-800 text-white hover:bg-brand-700 disabled:bg-brand-300',
  secondary: 'bg-white text-brand-800 border border-line hover:border-brand-300 hover:bg-brand-50 disabled:text-muted',
  ghost: 'text-brand-800 hover:bg-brand-50 disabled:text-muted',
  danger: 'bg-critical text-white hover:bg-critical-ink disabled:opacity-50',
  soft: 'bg-brand-50 text-brand-800 hover:bg-brand-100 disabled:text-muted',
};

export function Button({ variant = 'primary', size = 'md', loading, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors whitespace-nowrap',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-11 px-5 text-[15px]',
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button {...rest} aria-label={label} title={label} className={cx('inline-flex size-9 items-center justify-center rounded-full transition-colors', className)}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Badges & small display pieces
// ---------------------------------------------------------------------------
export type Tone = 'critical' | 'warn' | 'info' | 'ok' | 'brand' | 'neutral';
const TONES: Record<Tone, string> = {
  critical: 'bg-critical-soft text-critical-ink',
  warn: 'bg-warn-soft text-warn-ink',
  info: 'bg-info-soft text-info-ink',
  ok: 'bg-ok-soft text-ok-ink',
  brand: 'bg-brand-50 text-brand-800',
  neutral: 'bg-[#f1f0f4] text-ink-soft',
};

export function Badge({ tone = 'neutral', dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', TONES[tone], className)}>
      {dot && <span className={cx('size-1.5 rounded-full', tone === 'critical' ? 'bg-critical' : tone === 'warn' ? 'bg-warn' : tone === 'ok' ? 'bg-ok' : tone === 'info' ? 'bg-info' : 'bg-brand-600')} />}
      {children}
    </span>
  );
}

export const PRIORITY_TONE: Record<Priority, Tone> = { critical: 'critical', high: 'warn', watch: 'info', normal: 'neutral' };
const PRIORITY_LABEL: Record<Priority, string> = { critical: 'Critical', high: 'High', watch: 'Watch', normal: 'Normal' };

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return <Badge tone={PRIORITY_TONE[priority]} className={cx('px-3.5 py-1', className)}>{PRIORITY_LABEL[priority]}</Badge>;
}

export function RiskBadge({ risk }: { risk: number }) {
  const tone: Tone = risk >= 85 ? 'critical' : risk >= 65 ? 'warn' : risk >= 45 ? 'info' : 'neutral';
  return <Badge tone={tone} className="min-w-11 justify-center px-3">{risk}</Badge>;
}

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span className={cx(
      'inline-flex shrink-0 items-center justify-center rounded-full bg-peach font-semibold text-peach-ink',
      size === 'sm' && 'size-7 text-xs', size === 'md' && 'size-8 text-sm', size === 'lg' && 'size-10 text-sm',
      className,
    )}>
      {initials(name).slice(0, size === 'lg' ? 2 : 1)}
    </span>
  );
}

/** Delta chip like "+8.2%" / "−0:42". `good` decides colour: does the change go the right way? */
export function DeltaChip({ text, good }: { text: string; good: boolean | null }) {
  return <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-semibold', good == null ? TONES.neutral : good ? TONES.ok : TONES.critical)}>{text}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-brand-600', className)} />;
}

export function Empty({ title, body, className }: { title: string; body?: string; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-1 px-6 py-10 text-center', className)}>
      <p className="text-sm font-semibold text-ink-soft">{title}</p>
      {body && <p className="text-xs text-muted">{body}</p>}
    </div>
  );
}

export function ProgressBar({ value, color, className }: { value: number; color: string; className?: string }) {
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-[#ecebf1]', className)}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors', checked ? 'bg-brand-700' : 'bg-[#d9d6e2]', disabled && 'opacity-50')}
    >
      <span className={cx('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

export function Slider({ value, min, max, step, onChange, label }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string }) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      aria-label={label}
      className="slider"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ['--fill' as string]: `${fill}%` }}
    />
  );
}

export interface Option<T extends string> { value: T; label: string; hint?: string }

/** Pill-shaped dropdown like the design's "Last 30 min" / "All regions" / "Sort: risk" controls. */
export function PillSelect<T extends string>({ value, options, onChange, prefix, className, align = 'left', variant = 'pill', label }: {
  value: T; options: Option<T>[]; onChange: (v: T) => void; prefix?: string; className?: string; align?: 'left' | 'right'; variant?: 'pill' | 'field';
  /** Accessible name for the control, e.g. "Category" (announced as "Category: Shipping"). */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);
  const current = options.find((o) => o.value === value);
  return (
    <div ref={ref} className={cx('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label ? `${label}: ${current?.label ?? value}` : undefined}
        className={cx(
          'inline-flex w-full items-center justify-between gap-2 whitespace-nowrap transition-colors',
          variant === 'pill' ? 'h-8 rounded-full bg-brand-50 px-3.5 text-xs font-semibold text-brand-800 hover:bg-brand-100' : 'h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink hover:border-brand-300',
        )}
      >
        <span className="truncate">{prefix}{current?.label ?? value}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-70" />
      </button>
      {open && (
        <div role="listbox" className={cx('slide-in absolute z-40 mt-1.5 max-h-72 min-w-44 overflow-auto rounded-xl border border-line bg-white p-1 shadow-pop scroll-thin', align === 'right' ? 'right-0' : 'left-0')}>
          {options.map((o) => (
            <button
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={cx('flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-50', o.value === value && 'font-semibold text-brand-800')}
            >
              <span>
                {o.label}
                {o.hint && <span className="block text-xs font-normal text-muted">{o.hint}</span>}
              </span>
              {o.value === value && <Check className="size-4 text-brand-700" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md' }: { value: T; options: Option<T>[]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className={cx('inline-flex flex-wrap', size === 'sm' ? 'gap-1.5' : 'gap-2')} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-full font-semibold transition-colors',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-4 text-xs',
            o.value === value ? 'bg-brand-800 text-white' : 'bg-brand-50 text-ink-soft hover:bg-brand-100',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg', bare }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; width?: string; bare?: boolean;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2a2440]/35 p-4 backdrop-blur-[1px]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className={cx('slide-in max-h-[92vh] w-full overflow-hidden rounded-3xl bg-white shadow-pop', width)}>
        {bare ? children : (
          <div className="flex max-h-[92vh] flex-col">
            <div className="flex items-start justify-between gap-4 px-6 pt-5">
              <h2 className="text-lg font-semibold text-ink">{title}</h2>
              <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1 text-muted hover:bg-brand-50"><X className="size-4" /></IconButton>
            </div>
            <div className="overflow-auto px-6 py-4 scroll-thin">{children}</div>
            {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmModal({ open, title, body, confirmLabel, danger, onConfirm, onClose, loading }: {
  open: boolean; title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void; loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md" footer={(
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </>
    )}>
      <div className="text-sm text-ink-soft">{body}</div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
export function Toasts() {
  const toasts = useLive((s) => s.toasts);
  const dismiss = useLive((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx(
          'slide-in pointer-events-auto flex items-start gap-3 rounded-2xl border bg-white px-4 py-3 shadow-pop',
          t.tone === 'critical' ? 'border-critical/40' : t.tone === 'error' ? 'border-critical/30' : t.tone === 'success' ? 'border-ok/30' : 'border-line',
        )}>
          <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', t.tone === 'critical' || t.tone === 'error' ? 'bg-critical' : t.tone === 'success' ? 'bg-ok' : 'bg-brand-600', t.tone === 'critical' && 'pulse-dot')} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{t.title}</p>
            {t.body && <p className="mt-0.5 text-xs text-muted">{t.body}</p>}
          </div>
          {t.action && <Link to={t.action.href} onClick={() => dismiss(t.id)} className="text-xs font-semibold text-brand-700 hover:underline">{t.action.label}</Link>}
          <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-muted hover:text-ink"><X className="size-4" /></button>
        </div>
      ))}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('card', className)}>{children}</section>;
}

export function CardHeader({ title, subtitle, right, className }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0 shrink-0">
        <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}
