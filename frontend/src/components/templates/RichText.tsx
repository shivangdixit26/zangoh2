import { forwardRef, useImperativeHandle, useRef, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cx } from '../../lib/format';
import { parseSegments, placeholderText, varLabel, type VarValues } from '../../lib/templateVars';

/**
 * How a variable looks everywhere in the UI, so substitution is always obvious:
 *  - placeholder mode: grey ‹user name› token (as in the design's editor preview)
 *  - resolved: the substituted value on a green tint, with the variable name on hover
 *  - missing: amber ‹variable› chip that must be filled before sending
 */
export function VarChip({ name, value, mode }: { name: string; value?: string; mode: 'placeholder' | 'values' }) {
  if (mode === 'placeholder') {
    return <span className="text-muted" title={`Variable: ${varLabel(name)}`}>{placeholderText(name)}</span>;
  }
  if (value) {
    return (
      <span className="rounded bg-ok-soft px-0.5 text-ok-ink underline decoration-ok/50 decoration-dotted underline-offset-2" title={`{{${name}}} → ${value}`}>
        {value}
      </span>
    );
  }
  return (
    <span className="rounded bg-warn-soft px-1 font-medium text-warn-ink ring-1 ring-warn/50" title={`${varLabel(name)} needs a value`}>
      {placeholderText(name)}
    </span>
  );
}

const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s\n][^*\n]*\*|\{\{\s*[a-z][a-z0-9_]*\s*\}\})/g;

function renderInline(text: string, values: VarValues | null, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith('{{')) {
      const seg = parseSegments(tok)[0];
      const name = seg.type === 'var' ? seg.key : tok;
      out.push(<VarChip key={k} name={name} value={values?.[name]} mode={values ? 'values' : 'placeholder'} />);
    } else if (tok.startsWith('**')) out.push(<strong key={k} className="font-semibold text-ink">{renderInline(tok.slice(2, -2), values, k)}</strong>);
    else if (tok.startsWith('__')) out.push(<span key={k} className="underline">{renderInline(tok.slice(2, -2), values, k)}</span>);
    else out.push(<em key={k}>{renderInline(tok.slice(1, -1), values, k)}</em>);
    last = m.index! + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Renders the light markdown used by templates (**bold**, *italic*, __underline__, "- " lists) plus variable chips. */
export function RichText({ text, values = null, className }: { text: string; values?: VarValues | null; className?: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = (idx: number) => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(<Tag key={`l${idx}`} className={cx('my-1 pl-5', list.ordered ? 'list-decimal' : 'list-disc')}>{list.items.map((it, j) => <li key={j}>{renderInline(it, values, `li${idx}-${j}`)}</li>)}</Tag>);
    list = null;
  };
  lines.forEach((line, idx) => {
    const bullet = /^\s*[-•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush(idx);
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      return;
    }
    flush(idx);
    blocks.push(line.trim() ? <p key={idx}>{renderInline(line, values, `p${idx}`)}</p> : <div key={idx} className="h-2" />);
  });
  flush(lines.length);
  return <div className={cx('space-y-0.5 break-words', className)}>{blocks}</div>;
}

export interface HighlightTextareaHandle { el: HTMLTextAreaElement | null }

/**
 * A textarea with a synced backdrop that highlights {{variables}} in place.
 * The backdrop renders the same text with transparent glyphs, so only the highlight boxes show through.
 */
export const HighlightTextarea = forwardRef<HighlightTextareaHandle, TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; tone?: 'brand' | 'warn'; boxClassName?: string }>(
  function HighlightTextarea({ value, tone = 'brand', className, boxClassName, onScroll, ...rest }, ref) {
    const taRef = useRef<HTMLTextAreaElement>(null);
    const backRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => ({ get el() { return taRef.current; } }), []);
    const shared = 'whitespace-pre-wrap break-words px-3 py-2.5 text-sm leading-6 font-sans';
    return (
      <div className={cx('relative', boxClassName)}>
        <div ref={backRef} aria-hidden className={cx('pointer-events-none absolute inset-0 overflow-hidden text-transparent', shared)}>
          {parseSegments(value).map((s, i) => (s.type === 'text'
            ? <span key={i}>{s.value}</span>
            : <mark key={i} className={cx('rounded text-transparent', tone === 'warn' ? 'bg-warn-soft shadow-[0_0_0_1px_var(--color-warn)]' : 'bg-brand-100 shadow-[0_0_0_1px_var(--color-brand-300)]')}>{s.raw}</mark>))}
          {'\n'}
        </div>
        <textarea
          ref={taRef}
          value={value}
          onScroll={(e) => { if (backRef.current) backRef.current.scrollTop = e.currentTarget.scrollTop; onScroll?.(e); }}
          className={cx('relative block w-full resize-none bg-transparent text-ink outline-none placeholder:text-muted', shared, className)}
          {...rest}
        />
      </div>
    );
  },
);
