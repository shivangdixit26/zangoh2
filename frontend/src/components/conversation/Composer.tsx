import { AlertTriangle, CheckCircle2, ChevronDown, Mic, Square, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { cx } from '../../lib/format';
import { extractVariables, humanList, varLabel } from '../../lib/templateVars';
import { tidyTranscript, useSpeechRecognition } from '../../lib/useSpeechRecognition';
import { attempt, useLive } from '../../store/live';
import type { ConversationSummary } from '../../types';
import { HighlightTextarea, type HighlightTextareaHandle } from '../templates/RichText';
import type { InsertedTemplate } from '../templates/TemplatePickerModal';

export interface ComposerState {
  text: string;
  template: { id: string; name: string; resolved: string[] } | null;
  /** Set when the text came from dictation, so the message is tagged as a voice reply. */
  voice?: boolean;
}

const AUTO_SEND_SECONDS = 3;

/** Supervisor response box: type, dictate (Web Speech API) or insert a template. Sending while the AI is in control takes over first. */
export function Composer({ conv, state, onChange, onOpenTemplates }: {
  conv: ConversationSummary;
  state: ComposerState;
  onChange: (s: ComposerState) => void;
  onOpenTemplates: () => void;
}) {
  const supervisor = useLive((s) => s.supervisor);
  const voicePrefs = useLive((s) => s.voice);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const ref = useRef<HighlightTextareaHandle>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const resolved = conv.status === 'resolved';
  const lockedByOther = conv.control === 'supervisor' && conv.supervisor !== supervisor;
  const iControl = conv.control === 'supervisor' && conv.supervisor === supervisor;
  const unfilled = extractVariables(state.text);
  const blocked = resolved || lockedByOther;
  const canSend = !blocked && state.text.trim().length > 0 && unfilled.length === 0 && !sending;

  const send = useCallback(async (s: ComposerState = stateRef.current) => {
    if (blocked || !s.text.trim() || extractVariables(s.text).length) return;
    setCountdown(null);
    setSending(true);
    if (!(conv.control === 'supervisor' && conv.supervisor === supervisor)) {
      const took = await attempt(() => api.takeOver(conv.id));
      if (!took) { setSending(false); return; }
    }
    const source = s.voice ? 'voice' : s.template ? 'template' : 'typed';
    const ok = await attempt(() => api.sendMessage(conv.id, s.text.trim(), s.template?.id ?? null, source));
    setSending(false);
    if (ok) onChange({ text: '', template: null, voice: false });
  }, [blocked, conv.control, conv.supervisor, conv.id, supervisor, onChange]);

  // Dictation: the final transcript is appended to the reply box; with auto-send on, it goes out after a short countdown.
  const speech = useSpeechRecognition({
    lang: voicePrefs.lang,
    onFinish: (raw) => {
      const spoken = tidyTranscript(raw);
      const prev = stateRef.current.text.trim();
      const next: ComposerState = { ...stateRef.current, text: prev ? `${prev} ${spoken}` : spoken, voice: true };
      onChange(next);
      if (voicePrefs.autoSend && !extractVariables(next.text).length) setCountdown(AUTO_SEND_SECONDS);
    },
  });

  useEffect(() => {
    if (countdown == null) return undefined;
    if (countdown <= 0) { void send(); return undefined; }
    const t = setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, send]);

  useEffect(() => {
    if (speech.error) useLive.getState().toast({ tone: 'error', title: 'Voice input', body: speech.error });
  }, [speech.error]);

  // Switching conversations stops any dictation or pending auto-send (keyed on the id only; `speech.cancel` is stable).
  useEffect(() => () => { speech.cancel(); setCountdown(null); }, [conv.id]);

  const placeholder = resolved
    ? 'This conversation is resolved.'
    : lockedByOther
      ? `${conv.supervisor} is handling this conversation.`
      : speech.listening
        ? 'Listening… speak your reply'
        : iControl
          ? `Reply to ${conv.customer.name.split(' ')[0]} by typing or with the mic…`
          : 'Type or dictate a reply. Sending takes over from the AI…';

  const toggleMic = () => {
    setCountdown(null);
    if (speech.listening) speech.stop();
    else speech.start();
  };

  return (
    <div className="rounded-2xl border border-line bg-white px-3 py-3 sm:px-4 sm:py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-ink">Supervisor response</p>
        <button
          onClick={onOpenTemplates}
          disabled={blocked}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white py-1 pl-1 pr-2.5 text-[13px] text-ink-soft hover:border-brand-300 disabled:opacity-50"
        >
          <span className="inline-flex size-6 items-center justify-center rounded-full bg-peach text-[10px] font-bold text-peach-ink">T</span>
          Template <ChevronDown className="size-3.5" />
        </button>
      </div>

      {state.template && (
        <div className={cx('mt-2.5 flex items-start gap-2 rounded-xl px-3 py-2 text-[11.5px]', unfilled.length ? 'bg-warn-soft text-warn-ink' : 'bg-ok-soft text-ok-ink')}>
          {unfilled.length ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />}
          <span className="min-w-0 flex-1">
            <span className="font-semibold">Template “{state.template.name}”</span>
            {state.template.resolved.length > 0 && <> · {state.template.resolved.length} variable{state.template.resolved.length === 1 ? '' : 's'} filled ({humanList(state.template.resolved).toLowerCase()})</>}
            {unfilled.length > 0 && <> · replace the highlighted {unfilled.length === 1 ? 'placeholder' : 'placeholders'}: {unfilled.map(varLabel).join(', ').toLowerCase()}</>}
          </span>
          <button aria-label="Clear template" onClick={() => onChange({ text: '', template: null })} className="opacity-70 hover:opacity-100"><X className="size-3.5" /></button>
        </div>
      )}

      {speech.listening && (
        <div className="mt-2.5 flex items-start gap-2.5 rounded-xl bg-critical-soft/60 px-3 py-2 text-[12px]" role="status" aria-live="polite">
          <span className="mt-1 size-2 shrink-0 rounded-full bg-critical pulse-dot" />
          <span className="min-w-0 flex-1 text-ink">
            <span className="font-semibold text-critical-ink">Listening ({voicePrefs.lang})</span>
            {speech.finalText || speech.interimText
              ? <> · {speech.finalText} <span className="text-muted">{speech.interimText}</span></>
              : <span className="text-ink-soft"> · speak now; click stop when you're done</span>}
          </span>
          <button onClick={speech.cancel} className="text-[11px] font-semibold text-ink-soft hover:underline">Cancel</button>
        </div>
      )}

      {countdown != null && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-[12px] text-brand-900" role="status" aria-live="assertive">
          <Mic className="size-3.5" />
          <span className="flex-1">Sending your voice reply in {Math.max(0, countdown)}s…</span>
          <button onClick={() => void send()} className="rounded-lg bg-brand-800 px-2.5 py-1 text-[11px] font-semibold text-white">Send now</button>
          <button onClick={() => { setCountdown(null); ref.current?.el?.focus(); }} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-brand-800 hover:bg-white">Edit first</button>
        </div>
      )}

      <div className="mt-2.5 flex items-end gap-2 rounded-xl border border-line px-1 py-1 focus-within:border-brand-300">
        <HighlightTextarea
          ref={ref}
          tone="warn"
          value={state.text}
          disabled={blocked}
          onChange={(e) => {
            setCountdown(null);
            const text = e.target.value;
            // Clearing the box also clears its template / voice origin.
            onChange(text.trim() ? { ...state, text } : { text, template: null, voice: false });
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder={placeholder}
          rows={Math.min(6, Math.max(1, state.text.split('\n').length))}
          boxClassName="flex-1 min-w-0"
          aria-label="Supervisor reply"
        />
        <button
          type="button"
          onClick={toggleMic}
          disabled={blocked || !speech.supported}
          aria-pressed={speech.listening}
          aria-label={speech.listening ? 'Stop voice input' : 'Reply by voice'}
          title={!speech.supported ? 'Voice input needs Chrome or Edge (Web Speech API)' : speech.listening ? 'Stop and use what you said' : `Dictate a reply (${voicePrefs.lang})`}
          className={cx(
            'mb-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-40',
            speech.listening ? 'bg-critical text-white' : 'bg-brand-50 text-brand-800 hover:bg-brand-100',
          )}
        >
          {speech.listening ? <Square className="size-4 fill-current" /> : <Mic className="size-[18px]" />}
        </button>
        <button
          onClick={() => void send()}
          disabled={!canSend}
          title={unfilled.length ? 'Fill in the highlighted variables first' : undefined}
          className="mb-0.5 h-10 shrink-0 rounded-xl bg-brand-800 px-3 text-[13px] font-semibold text-white hover:bg-brand-700 disabled:bg-brand-300 sm:px-5"
        >
          {sending ? 'Sending…' : iControl ? 'Send reply' : 'Take over & send'}
        </button>
      </div>
      {unfilled.length > 0 && !state.template && (
        <p className="mt-1.5 text-[11px] text-warn-ink">Replace {unfilled.map((k) => `{{${k}}}`).join(', ')} before sending.</p>
      )}
    </div>
  );
}

export function applyInsertedTemplate(r: InsertedTemplate): ComposerState {
  return { text: r.text, template: { id: r.template.id, name: r.template.name, resolved: r.resolved } };
}
