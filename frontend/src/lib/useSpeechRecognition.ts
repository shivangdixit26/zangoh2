import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal typings for the Web Speech API (not in TypeScript's DOM lib yet).
interface SpeechAlternative { transcript: string; confidence: number }
interface SpeechResult { isFinal: boolean; length: number; [index: number]: SpeechAlternative }
interface SpeechResultEvent { resultIndex: number; results: { length: number; [index: number]: SpeechResult } }
interface SpeechErrorEvent { error: string; message?: string }
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type Ctor = new () => SpeechRecognitionLike;

function getCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupported = () => getCtor() !== null;

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Allow the microphone for this site and try again.',
  'service-not-allowed': 'Speech recognition is not allowed in this browser profile.',
  'no-speech': "Didn't catch anything. Try again and speak after the beep.",
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition needs an internet connection (Chrome sends audio to Google).',
  'language-not-supported': 'That voice language is not supported by this browser.',
};

export interface UseSpeech {
  supported: boolean;
  listening: boolean;
  /** Final text recognised in this session. */
  finalText: string;
  /** Words still being recognised (not yet final). */
  interimText: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  cancel: () => void;
}

/**
 * Dictation via the Web Speech API (Chrome/Edge: webkitSpeechRecognition).
 * `onFinish` receives the full transcript when listening stops, whether the user stopped it or the browser detected silence.
 */
export function useSpeechRecognition({ lang, onFinish }: { lang: string; onFinish: (text: string) => void }): UseSpeech {
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef('');
  const cancelled = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => () => rec.current?.abort(), []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) { setError('Voice input is not supported in this browser. Use Chrome or Edge.'); return; }
    rec.current?.abort();
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    finalRef.current = '';
    cancelled.current = false;
    setFinalText('');
    setInterimText('');
    setError(null);
    r.onstart = () => setListening(true);
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const res = e.results[i];
        const text = res[0]?.transcript ?? '';
        if (res.isFinal) finalRef.current = `${finalRef.current} ${text}`.replace(/\s+/g, ' ').trim();
        else interim += text;
      }
      setFinalText(finalRef.current);
      setInterimText(interim.trim());
    };
    r.onerror = (e) => {
      if (e.error === 'aborted') return;
      setError(ERRORS[e.error] ?? `Voice input error: ${e.error}`);
    };
    r.onend = () => {
      setListening(false);
      setInterimText('');
      rec.current = null;
      const text = finalRef.current.trim();
      if (!cancelled.current && text) onFinishRef.current(text);
    };
    rec.current = r;
    try {
      r.start();
    } catch {
      setError('Could not start the microphone. Is another tab using it?');
    }
  }, [lang]);

  const stop = useCallback(() => rec.current?.stop(), []);
  const cancel = useCallback(() => {
    cancelled.current = true;
    rec.current?.abort();
  }, []);

  return { supported: speechSupported(), listening, finalText, interimText, error, start, stop, cancel };
}

/** Spoken punctuation commands → symbols, and sentence-case the first letter. */
export function tidyTranscript(text: string): string {
  const out = text
    .replace(/\s*\b(comma)\b/gi, ',')
    .replace(/\s*\b(full stop|period)\b/gi, '.')
    .replace(/\s*\b(question mark)\b/gi, '?')
    .replace(/\s*\b(exclamation mark)\b/gi, '!')
    .replace(/\s+([,.?!])/g, '$1')
    .trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}
