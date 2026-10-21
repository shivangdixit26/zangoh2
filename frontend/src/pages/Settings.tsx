import { CheckCircle2, Mic, RotateCcw, Square, UserPlus, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Avatar, Badge, Button, Card, CardHeader, ConfirmModal, PillSelect, Segmented, Spinner, Toggle } from '../components/ui';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { tidyTranscript, useSpeechRecognition } from '../lib/useSpeechRecognition';
import { attempt, useLive } from '../store/live';

const VOICE_LANGS = [
  { value: 'en-IN', label: 'English (India)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'hi-IN', label: 'Hindi (India)' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
];

function VoiceSettings() {
  const voice = useLive((s) => s.voice);
  const setVoice = useLive((s) => s.setVoice);
  const [heard, setHeard] = useState('');
  const speech = useSpeechRecognition({ lang: voice.lang, onFinish: (t) => setHeard(tidyTranscript(t)) });
  return (
    <Card className="p-5">
      <CardHeader
        title="Voice input"
        subtitle="Dictate replies in the conversation screen with the mic button. Uses the browser's Web Speech API (Chrome and Edge)."
        right={speech.supported ? <Badge tone="ok">Supported in this browser</Badge> : <Badge tone="warn">Not supported here, use Chrome or Edge</Badge>}
      />
      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-ink">Recognition language</span>
          <PillSelect variant="field" className="w-52" value={voice.lang} onChange={(lang) => setVoice({ lang })} options={VOICE_LANGS} align="right" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink">
            Send automatically when I stop speaking
            <span className="block text-xs text-muted">A 3-second countdown lets you edit first. Turn off to always review before sending.</span>
          </span>
          <Toggle label="Auto-send voice replies" checked={voice.autoSend} onChange={(autoSend) => setVoice({ autoSend })} />
        </div>
        <div className="rounded-xl bg-[#f8f6fb] p-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant={speech.listening ? 'danger' : 'secondary'} disabled={!speech.supported} onClick={() => (speech.listening ? speech.stop() : (setHeard(''), speech.start()))}>
              {speech.listening ? <><Square className="size-3.5 fill-current" />Stop</> : <><Mic className="size-3.5" />Test microphone</>}
            </Button>
            <span className="min-w-0 flex-1 text-xs text-ink-soft">
              {speech.listening ? <>{speech.finalText} <span className="text-muted">{speech.interimText || 'Listening…'}</span></> : heard ? <>Heard: “{heard}”</> : 'Say a sentence to check the microphone and language.'}
            </span>
          </div>
          {speech.error && <p className="mt-2 text-xs text-critical-ink">{speech.error}</p>}
        </div>
      </div>
    </Card>
  );
}

export default function Settings() {
  const supervisor = useLive((s) => s.supervisor);
  const setSupervisor = useLive((s) => s.setSupervisor);
  const sim = useLive((s) => s.simulator);
  const [name, setName] = useState(supervisor);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { data: health, loading, reload } = useAsync(() => api.health(), []);

  const reset = async () => {
    setResetting(true);
    await attempt(() => api.reset(), 'Demo data reset to the seeded state');
    setResetting(false);
    setConfirmReset(false);
  };

  const status = (ok: boolean | undefined, label: string, detail?: string) => (
    <div className="flex items-center justify-between rounded-xl bg-[#f8f6fb] px-4 py-3">
      <span className="text-sm text-ink">{label}{detail && <span className="block text-xs text-muted">{detail}</span>}</span>
      {ok ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok-ink"><CheckCircle2 className="size-4" />Healthy</span>
        : <span className="inline-flex items-center gap-1 text-xs font-semibold text-critical-ink"><XCircle className="size-4" />Unavailable</span>}
    </div>
  );

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-[13px] text-muted">Supervisor identity, live simulation and system health</p>
      </div>

      <Card className="p-5">
        <CardHeader title="Supervisor identity" subtitle="There is no login in this demo. Your name is sent with every action and used for takeover locks, notes and audit events." />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Avatar name={supervisor} size="lg" />
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Supervisor name" className="h-10 min-w-56 flex-1 rounded-xl border border-line px-3 text-sm outline-none focus:border-brand-300" />
          <Button onClick={() => { setSupervisor(name); useLive.getState().toast({ tone: 'success', title: `Acting as ${name.trim() || 'Neha Prasad'}` }); }} disabled={name.trim() === supervisor}><UserPlus className="size-4" />Switch supervisor</Button>
        </div>
        <p className="mt-2 text-xs text-muted">Tip: open a second browser tab as “Rahul Mehta” to see the one-supervisor-per-conversation lock in action.</p>
      </Card>

      <VoiceSettings />

      <Card className="p-5">
        <CardHeader title="Live simulation" subtitle="Simulates customers and AI agent replies so the workstation stays in motion. The AI replies come from the mock LLM using each agent's live configuration." />
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink">Simulator running</span>
            <Toggle label="Simulator running" checked={sim.running} onChange={(running) => attempt(() => api.setSimulator({ running }))} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-ink">Speed</span>
            <Segmented size="sm" value={String(sim.speed)} onChange={(v) => attempt(() => api.setSimulator({ speed: Number(v) }))} options={['0.5', '1', '2', '4'].map((v) => ({ value: v, label: `${v}×` }))} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => attempt(() => api.spawn(), 'New customer conversation started')}>Start a new conversation</Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <CardHeader title="System health" right={<Button variant="ghost" size="sm" onClick={reload}>Refresh</Button>} />
        {loading && !health ? <div className="py-6"><Spinner /></div> : (
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {status(true, 'API & realtime', 'Express + Socket.IO')}
            {status(health?.services.mockLlm, 'Mock LLM', 'chat completions + embeddings')}
            {status(health?.services.vectorDb, 'Vector DB', `${health?.knowledgeBase.indexed ?? 0}/${health?.knowledgeBase.total ?? 0} knowledge docs indexed`)}
          </div>
        )}
      </Card>

      <Card className="border-critical/30 p-5">
        <CardHeader title="Reset demo data" subtitle="Restores the seeded conversations, agents, presets and templates. Everyone connected sees the reset immediately." />
        <Button variant="danger" className="mt-4" onClick={() => setConfirmReset(true)}><RotateCcw className="size-4" />Reset demo data</Button>
      </Card>

      <ConfirmModal open={confirmReset} title="Reset all demo data?" body="Conversations, alerts, drafts, custom presets and templates go back to their seeded state. This can't be undone." confirmLabel="Reset" danger loading={resetting} onConfirm={reset} onClose={() => setConfirmReset(false)} />
    </div>
  );
}
