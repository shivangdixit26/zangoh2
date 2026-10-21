import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from './config.ts';
import { recommendedAction } from './services/risk.ts';
import { store } from './store.ts';
import type { Alert, Conversation, FeedEvent, Message } from './types.ts';

let io: Server | null = null;

export function initSockets(server: HttpServer): Server {
  io = new Server(server, { cors: { origin: config.corsOrigin }, path: '/socket.io' });
  io.on('connection', (socket) => {
    socket.emit('hello', { serverTime: Date.now() });
  });
  return io;
}

export type ConversationSummary = Omit<Conversation, 'messages'> & {
  messageCount: number;
  lastMessage: Pick<Message, 'role' | 'text' | 'ts'> | null;
  /** When the customer started waiting for a reply (oldest unanswered customer message), null if nobody is waiting. */
  waitingSince: number | null;
  recommendedAction: ReturnType<typeof recommendedAction>;
};

export function toSummary(conv: Conversation): ConversationSummary {
  const { messages, ...rest } = conv;
  const visible = messages.filter((m) => m.role !== 'note');
  const last = visible[visible.length - 1] ?? null;
  let waitingSince: number | null = null;
  for (let i = visible.length - 1; i >= 0; i -= 1) {
    const m = visible[i];
    if (m.role === 'customer') waitingSince = m.ts;
    else if (m.role === 'ai' || m.role === 'supervisor') break;
  }
  const cfg = store.state.agents.find((a) => a.id === conv.agentId)?.config;
  return {
    ...rest,
    messageCount: messages.length,
    lastMessage: last ? { role: last.role, text: last.text, ts: last.ts } : null,
    waitingSince: conv.status === 'resolved' ? null : waitingSince,
    recommendedAction: cfg ? recommendedAction(conv, cfg) : 'monitor',
  };
}

let metricsTimer: NodeJS.Timeout | null = null;

export const emit = {
  conversation(conv: Conversation) {
    io?.emit('conversation:updated', toSummary(conv));
  },
  message(conversationId: string, message: Message) {
    io?.emit('message:new', { conversationId, message });
  },
  alert(alert: Alert) {
    io?.emit('alert:updated', alert);
  },
  feed(event: FeedEvent) {
    io?.emit('feed:new', event);
  },
  agent(agentId: string) {
    io?.emit('agent:updated', { agentId });
  },
  templates() {
    io?.emit('templates:changed', {});
  },
  presets() {
    io?.emit('presets:changed', {});
  },
  simulator() {
    io?.emit('simulator:updated', store.state.simulator);
  },
  /** Coalesced so a burst of changes triggers one client refetch of the (filter-dependent) metrics. */
  metricsChanged() {
    if (metricsTimer) return;
    metricsTimer = setTimeout(() => {
      metricsTimer = null;
      io?.emit('metrics:changed', { ts: Date.now() });
    }, 1000);
  },
  reset() {
    io?.emit('state:reset', {});
  },
};
