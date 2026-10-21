import { Bold, Braces, Check, Italic, List, ListOrdered, MoreVertical, Redo2, Sparkles, Underline, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../../lib/api';
import { cx } from '../../lib/format';
import { useClickOutside } from '../../lib/hooks';
import { extractVariables, unknownVariables, VARIABLE_MAP, VARIABLES, variableProblems, varLabel } from '../../lib/templateVars';
import { attempt } from '../../store/live';
import type { Template, TemplateInput } from '../../types';
import { Modal, PillSelect, Toggle } from '../ui';
import { HighlightTextarea, RichText, type HighlightTextareaHandle } from './RichText';
import { DEFAULT_CATEGORIES } from './TemplateLibrary';

const TYPES: TemplateInput['type'][] = ['Chat', 'Email', 'SMS'];
const NEW_CATEGORY = '__new__';
const CHANNELS = ['Website', 'Messenger', 'Email', 'Mobile'];
const SAMPLE_VALUES = Object.fromEntries(VARIABLES.map((v) => [v.key, v.sample]));

const EMPTY: TemplateInput = { name: '', title: '', category: 'General', type: 'Chat', channels: ['Website'], content: '', cta: null, shared: true };

function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] text-ink-soft">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-[11px] font-medium text-critical-ink">{error}</span>}
    </label>
  );
}

const inputCls = 'h-10 w-full rounded-xl border border-[#c9c5d6] bg-white px-4 text-sm text-ink outline-none placeholder:text-muted focus:border-brand-500';

/** Template creation / edit modal ("Edit Template" in the design). */
export function TemplateEditorModal({ open, template, onClose, onSaved, categories = [] }: {
  open: boolean; template: Template | null; onClose: () => void; onSaved?: (t: Template) => void; categories?: string[];
}) {
  const [form, setForm] = useState<TemplateInput>(EMPTY);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sample, setSample] = useState(false);
  const [varMenu, setVarMenu] = useState(false);
  const editor = useRef<HighlightTextareaHandle>(null);
  const varMenuRef = useClickOutside<HTMLDivElement>(() => setVarMenu(false), varMenu);

  useEffect(() => {
    if (!open) return;
    setForm(template ? { name: template.name, title: template.title, category: template.category, type: template.type, channels: template.channels, content: template.content, cta: template.cta, shared: template.shared } : EMPTY);
    setNewCategory(null);
    setTouched(false);
    setSample(false);
  }, [open, template]);

  const set = <K extends keyof TemplateInput>(k: K, v: TemplateInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const vars = useMemo(() => extractVariables(form.content), [form.content]);
  const unknown = useMemo(() => unknownVariables(form.content), [form.content]);
  const categoryOptions = useMemo(() => [...new Set([...DEFAULT_CATEGORIES, ...categories, form.category].filter(Boolean))], [categories, form.category]);
  const errors = {
    name: !form.name.trim() ? 'Give the template a name' : undefined,
    category: !form.category.trim() ? 'Name the new category' : undefined,
    content: !form.content.trim() ? 'Write the message content' : variableProblems(`${form.content} ${form.title}`)[0],
    channels: !form.channels.length ? 'Pick at least one channel' : undefined,
  };
  const valid = !errors.name && !errors.category && !errors.content && !errors.channels;

  /** Edit through execCommand so the browser's native undo/redo stack keeps working. */
  const replaceSelection = (fn: (selected: string) => string, selectInner = true) => {
    const el = editor.current?.el;
    if (!el) return;
    el.focus();
    const { selectionStart: s, selectionEnd: e, value } = el;
    const selected = value.slice(s, e);
    const next = fn(selected);
    document.execCommand('insertText', false, next);
    if (selectInner && selected) {
      const offset = next.indexOf(selected);
      requestAnimationFrame(() => el.setSelectionRange(s + offset, s + offset + selected.length));
    }
  };
  const wrap = (marker: string) => replaceSelection((sel) => `${marker}${sel || 'text'}${marker}`);
  const listify = (ordered: boolean) => replaceSelection((sel) => (sel || 'item').split('\n').map((l, i) => `${ordered ? `${i + 1}.` : '-'} ${l.replace(/^\s*([-•]|\d+[.)])\s+/, '')}`).join('\n'), false);
  const insertVar = (key: string) => { replaceSelection(() => `{{${key}}}`, false); setVarMenu(false); };
  const cmd = (c: 'undo' | 'redo') => { editor.current?.el?.focus(); document.execCommand(c); };

  const save = async () => {
    setTouched(true);
    if (!valid) return;
    setSaving(true);
    const payload = { ...form, cta: form.cta?.trim() || null };
    const saved = await attempt(() => (template ? api.updateTemplate(template.id, payload) : api.createTemplate(payload)), template ? 'Template updated' : 'Template created');
    setSaving(false);
    if (saved) { onSaved?.(saved); onClose(); }
  };

  const tool = (label: string, onClick: () => void, Icon: typeof Bold) => (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} title={label} aria-label={label} className="rounded p-1 text-ink-soft hover:bg-brand-50 hover:text-ink"><Icon className="size-3.5" /></button>
  );

  return (
    <Modal open={open} onClose={onClose} bare width="max-w-[1120px]">
      <div className="grid max-h-[92vh] grid-cols-1 gap-6 overflow-auto bg-[#ecebf2] p-6 scroll-thin md:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] md:p-9">
        <div className="flex min-w-0 flex-col">
          <h2 className="mb-4 text-xl font-medium text-ink">{template ? 'Edit Template' : 'Create Template'}</h2>
          <div className="flex flex-1 flex-col gap-4 rounded-3xl bg-white p-6 md:p-7">
            <Field label="Name" error={touched ? errors.name : undefined}>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Template name" className={inputCls} maxLength={80} />
            </Field>
            <Field label="Title" hint="Short description shown on the template card.">
              <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Say Hi to welcome new visitors!" className={inputCls} maxLength={140} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Category" error={touched ? errors.category : undefined} hint="The scenario this reply is for.">
                {newCategory === null ? (
                  <PillSelect
                    variant="field"
                    label="Category"
                    value={form.category}
                    onChange={(v) => (v === NEW_CATEGORY ? setNewCategory('') : set('category', v))}
                    options={[
                      ...categoryOptions.map((c) => ({ value: c, label: c })),
                      { value: NEW_CATEGORY, label: '+ New category…' },
                    ]}
                    className="[&>button]:border-[#c9c5d6]"
                  />
                ) : (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={newCategory}
                      maxLength={30}
                      onChange={(e) => { setNewCategory(e.target.value); set('category', e.target.value.trim()); }}
                      placeholder="e.g. Warranty"
                      aria-label="New category name"
                      className={inputCls}
                    />
                    <button type="button" onClick={() => { setNewCategory(null); set('category', template?.category ?? 'General'); }} className="shrink-0 rounded-xl px-3 text-xs font-semibold text-ink-soft hover:bg-brand-50">Cancel</button>
                  </div>
                )}
              </Field>
              <Field label="Message type">
                <PillSelect variant="field" label="Message type" value={form.type} onChange={(v) => set('type', v)} options={TYPES.map((c) => ({ value: c, label: c }))} className="[&>button]:border-[#c9c5d6]" />
              </Field>
            </div>
            <Field label="Channels" error={touched ? errors.channels : undefined}>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((c) => {
                  const on = form.channels.includes(c);
                  return (
                    <button key={c} type="button" aria-pressed={on} onClick={() => set('channels', on ? form.channels.filter((x) => x !== c) : [...form.channels, c])}
                      className={cx('h-8 rounded-full px-3.5 text-xs font-semibold transition-colors', on ? 'bg-brand-800 text-white' : 'bg-brand-50 text-ink-soft hover:bg-brand-100')}>
                      {on && <Check className="mr-1 inline size-3" />}{c}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Content" error={touched || form.content ? errors.content : undefined}>
              <div className="rounded-xl border border-[#c9c5d6] focus-within:border-brand-500">
                <HighlightTextarea
                  ref={editor}
                  value={form.content}
                  onChange={(e) => set('content', e.target.value)}
                  placeholder="Hi {{user_name}}! Welcome to {{company_name}}. How may I be of help today?"
                  rows={5}
                  maxLength={2000}
                />
                <div className="flex flex-wrap items-center gap-0.5 border-t border-line px-2 py-1.5">
                  {tool('Undo', () => cmd('undo'), Undo2)}
                  {tool('Redo', () => cmd('redo'), Redo2)}
                  <span className="mx-1 h-4 w-px bg-line" />
                  {tool('Bold', () => wrap('**'), Bold)}
                  {tool('Italic', () => wrap('*'), Italic)}
                  {tool('Underline', () => wrap('__'), Underline)}
                  <span className="mx-1 h-4 w-px bg-line" />
                  {tool('Bulleted list', () => listify(false), List)}
                  {tool('Numbered list', () => listify(true), ListOrdered)}
                  <span className="mx-1 h-4 w-px bg-line" />
                  <div ref={varMenuRef} className="relative">
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setVarMenu((v) => !v)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                      <Braces className="size-3.5" />Insert variable
                    </button>
                    {varMenu && (
                      <div className="slide-in absolute bottom-9 left-0 z-20 max-h-64 w-64 overflow-auto rounded-xl border border-line bg-white p-1 shadow-pop scroll-thin">
                        {VARIABLES.map((v) => (
                          <button key={v.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertVar(v.key)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-brand-50">
                            <span>{v.label}</span><code className="text-[10px] text-brand-700">{`{{${v.key}}}`}</code>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="ml-auto text-[10px] text-muted">{form.content.length}/2000</span>
                </div>
              </div>
            </Field>
            {vars.length > 0 && (
              <div className="-mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-muted">Variables:</span>
                {vars.map((v) => (
                  <span key={v} className={cx('rounded-md px-2 py-0.5 font-medium', VARIABLE_MAP[v] ? 'bg-brand-100 text-brand-800' : 'bg-warn-soft text-warn-ink')} title={VARIABLE_MAP[v] ? `Filled automatically: ${varLabel(v)}` : 'Not a standard variable: supervisors will type a value when they use this template'}>
                    {VARIABLE_MAP[v] ? varLabel(v) : `${v} (manual)`}
                  </span>
                ))}
              </div>
            )}
            {unknown.length > 0 && <p className="-mt-2 text-[11px] text-warn-ink">{unknown.length === 1 ? 'One variable is' : `${unknown.length} variables are`} not standard. Supervisors will be asked to type a value before sending.</p>}
            <Field label="Call-to-action button (optional)">
              <input value={form.cta ?? ''} onChange={(e) => set('cta', e.target.value)} placeholder="e.g. View getting started" className={inputCls} maxLength={40} />
            </Field>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
              <div>
                <button type="button" aria-pressed={form.shared} onClick={() => set('shared', !form.shared)}
                  className={cx('inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] transition-colors', form.shared ? 'bg-brand-800 text-white' : 'border border-brand-300 bg-white text-brand-800')}>
                  Share with Team {form.shared && <Check className="size-4" />}
                </button>
                <p className="mt-1.5 text-[11px] text-muted">{form.shared ? 'Every supervisor can find and use it. Only you can edit it.' : 'Private: only you can see and use it.'}</p>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="h-11 rounded-full bg-[#efeef0] px-5 text-[15px] text-ink hover:bg-[#e5e4e8]">Cancel</button>
                <button type="button" onClick={save} disabled={saving} className="h-11 rounded-full bg-brand-800 px-5 text-[15px] text-white hover:bg-brand-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-medium text-ink">Preview</h2>
            <label className="flex items-center gap-2 text-xs text-ink-soft">Sample values <Toggle checked={sample} onChange={setSample} label="Show sample values" /></label>
          </div>
          <div className="flex flex-1 flex-col justify-center rounded-3xl bg-white p-4">
            {form.content.trim() ? (
              <div className="rounded-2xl border border-line p-3.5">
                <div className="flex items-start gap-3">
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-ink-soft ring-1 ring-brand-100"><Sparkles className="size-3 text-brand-500" />{form.type}</span>
                  <RichText text={form.content} values={sample ? SAMPLE_VALUES : null} className="min-w-0 flex-1 text-[13px] text-ink" />
                  <MoreVertical className="size-4 shrink-0 text-muted" />
                </div>
                {form.cta?.trim() && <div className="mt-3 flex justify-center"><span className="rounded-xl bg-brand-800 px-5 py-1.5 text-xs font-semibold text-white">{form.cta}</span></div>}
              </div>
            ) : <p className="text-center text-sm text-muted">Your message preview appears here.</p>}
            {vars.length > 0 && (
              <p className="mt-4 text-center text-[11px] text-muted">
                {sample ? 'Showing sample values. Variables are filled from the live conversation when used.' : 'Grey ‹tokens› are variables, filled in automatically when the template is used.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
