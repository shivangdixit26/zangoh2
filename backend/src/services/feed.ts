import { emit } from '../events.ts';
import { uid } from '../lib/util.ts';
import { store } from '../store.ts';
import type { FeedEvent } from '../types.ts';

export function addFeed(kind: string, title: string, detail: string, tone: FeedEvent['tone'] = 'info', conversationId: string | null = null): FeedEvent {
  const event: FeedEvent = { id: uid('f'), ts: Date.now(), kind, title, detail, tone, conversationId };
  store.state.feed.unshift(event);
  if (store.state.feed.length > 200) store.state.feed.length = 200;
  emit.feed(event);
  store.save();
  return event;
}
