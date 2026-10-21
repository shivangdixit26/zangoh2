import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import { api, setApiSupervisor } from '../lib/api';
import type { Alert, ConversationSummary, FeedEvent, Message } from '../types';

export interface Toast {
  id: string;
  tone: 'success' | 'error' | 'info' | 'critical';
  title: string;
  body?: string;
  action?: { label: string; href: string };
}

const SUPERVISOR_KEY = 'sw.supervisor';
const VOICE_KEY = 'sw.voice';
function loadSupervisor(): string {
  try { return localStorage.getItem(SUPERVISOR_KEY) || 'Neha Prasad'; } catch { return 'Neha Prasad'; }
}

export interface VoicePrefs { lang: string; autoSend: boolean }
const DEFAULT_VOICE: VoicePrefs = { lang: 'en-IN', autoSend: true };
function loadVoice(): VoicePrefs {
  try { return { ...DEFAULT_VOICE, ...JSON.parse(localStorage.getItem(VOICE_KEY) ?? '{}') }; } catch { return DEFAULT_VOICE; }
}

interface LiveState {
  connected: boolean;
  ready: boolean;
  supervisor: string;
  voice: VoicePrefs;
  conversations: Record<string, ConversationSummary>;
  messages: Record<string, Message[]>;
  alerts: Record<string, Alert>;
  feed: FeedEvent[];
  simulator: { running: boolean; speed: number };
  versions: { metrics: number; templates: number; presets: number; agents: Record<string, number> };
  toasts: Toast[];

  setSupervisor(name: string): void;
  setVoice(patch: Partial<VoicePrefs>): void;
  upsertConversation(c: ConversationSummary): void;
  setMessages(id: string, messages: Message[]): void;
  upsertAlert(a: Alert): void;
  toast(t: Omit<Toast, 'id'>): void;
  dismissToast(id: string): void;
  refreshAll(): Promise<void>;
}

export const useLive = create<LiveState>((set, get) => ({
  connected: false,
  ready: false,
  supervisor: loadSupervisor(),
  voice: loadVoice(),
  conversations: {},
  messages: {},
  alerts: {},
  feed: [],
  simulator: { running: true, speed: 1 },
  versions: { metrics: 0, templates: 0, presets: 0, agents: {} },
  toasts: [],

  setSupervisor(name) {
    const clean = name.trim() || 'Neha Prasad';
    try { localStorage.setItem(SUPERVISOR_KEY, clean); } catch { /* storage unavailable: keep in memory only */ }
    setApiSupervisor(clean);
    set({ supervisor: clean });
  },

  setVoice(patch) {
    const voice = { ...get().voice, ...patch };
    try { localStorage.setItem(VOICE_KEY, JSON.stringify(voice)); } catch { /* storage unavailable: keep in memory only */ }
    set({ voice });
  },

  upsertConversation(c) {
    set((s) => ({ conversations: { ...s.conversations, [c.id]: c } }));
  },

  setMessages(id, messages) {
    set((s) => ({ messages: { ...s.messages, [id]: messages } }));
  },

  upsertAlert(a) {
    set((s) => ({ alerts: { ...s.alerts, [a.id]: a } }));
  },

  toast(t) {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => get().dismissToast(id), t.tone === 'critical' ? 7000 : 4500);
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  async refreshAll() {
    const [open, resolved, alerts, feed, simulator] = await Promise.all([
      api.conversations({ status: 'open' }),
      api.conversations({ status: 'resolved', limit: 40, sort: 'newest' }),
      api.alerts(),
      api.feed(40),
      api.simulator(),
    ]);
    const conversations: Record<string, ConversationSummary> = {};
    for (const c of [...resolved.items, ...open.items]) conversations[c.id] = c;
    set((s) => ({
      conversations,
      alerts: Object.fromEntries(alerts.items.map((a) => [a.id, a])),
      feed: feed.items,
      simulator,
      ready: true,
      versions: { ...s.versions, metrics: s.versions.metrics + 1, templates: s.versions.templates + 1, presets: s.versions.presets + 1 },
    }));
    // Re-sync any conversation threads that are open on screen.
    for (const id of Object.keys(get().messages)) {
      api.conversation(id).then((d) => get().setMessages(id, d.messages)).catch(() => undefined);
    }
  },
}));

setApiSupervisor(useLive.getState().supervisor);

let socket: Socket | null = null;

export function connectLive(): () => void {
  if (socket) return () => undefined;
  socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
  const s = useLive.getState;
  const bump = (key: 'metrics' | 'templates' | 'presets') =>
    useLive.setState((st) => ({ versions: { ...st.versions, [key]: st.versions[key] + 1 } }));

  socket.on('connect', () => {
    useLive.setState({ connected: true });
    s().refreshAll().catch(() => s().toast({ tone: 'error', title: 'Could not load live data', body: 'Is the backend running on port 4000?' }));
  });
  socket.on('disconnect', () => useLive.setState({ connected: false }));
  socket.on('conversation:updated', (c: ConversationSummary) => s().upsertConversation(c));
  socket.on('message:new', ({ conversationId, message }: { conversationId: string; message: Message }) => {
    const existing = s().messages[conversationId];
    if (existing && !existing.some((m) => m.id === message.id)) s().setMessages(conversationId, [...existing, message]);
  });
  socket.on('alert:updated', (a: Alert) => {
    const isNew = !s().alerts[a.id];
    s().upsertAlert(a);
    if (isNew && a.status === 'open' && a.severity === 'critical') {
      s().toast({
        tone: 'critical',
        title: a.title,
        body: a.detail,
        action: a.conversationId ? { label: 'Open', href: `/conversations/${a.conversationId}` } : a.agentId ? { label: 'Open agent', href: `/agents/${a.agentId}` } : undefined,
      });
    }
  });
  socket.on('feed:new', (e: FeedEvent) => useLive.setState((st) => ({ feed: [e, ...st.feed].slice(0, 60) })));
  socket.on('metrics:changed', () => bump('metrics'));
  socket.on('templates:changed', () => bump('templates'));
  socket.on('presets:changed', () => bump('presets'));
  socket.on('agent:updated', ({ agentId }: { agentId: string }) =>
    useLive.setState((st) => ({ versions: { ...st.versions, agents: { ...st.versions.agents, [agentId]: (st.versions.agents[agentId] ?? 0) + 1 } } })));
  socket.on('simulator:updated', (sim: { running: boolean; speed: number }) => useLive.setState({ simulator: sim }));
  socket.on('state:reset', () => {
    useLive.setState({ messages: {} });
    s().refreshAll().catch(() => undefined);
  });

  return () => {
    socket?.disconnect();
    socket = null;
  };
}

/** Run an API action and surface failures as a toast. Returns undefined on failure. */
export async function attempt<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
  try {
    const out = await fn();
    if (success) useLive.getState().toast({ tone: 'success', title: success });
    return out;
  } catch (err) {
    useLive.getState().toast({ tone: 'error', title: (err as Error).message || 'Something went wrong' });
    return undefined;
  }
}
