import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { HttpError } from './lib/http.ts';
import { SCHEMA_VERSION, buildInitialState } from './seed.ts';
import type { Agent, Conversation, State } from './types.ts';

const DB_FILE = path.join(config.runtimeDir, 'db.json');
const MAX_FEED = 200;
const SNAPSHOT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Shift every timestamp field by `delta` so a restored demo resumes "live" instead of showing hours-old waits.
 * Timestamp fields are numbers whose key is `t`, `ts` or ends in `At`.
 */
function shiftTimestamps(node: unknown, delta: number): void {
  if (Array.isArray(node)) { node.forEach((n) => shiftTimestamps(n, delta)); return; }
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number' && (k === 't' || k === 'ts' || k.endsWith('At'))) obj[k] = v + delta;
    else if (v && typeof v === 'object') shiftTimestamps(v, delta);
  }
}

class Store {
  state!: State;
  private saveTimer: NodeJS.Timeout | null = null;

  load(): void {
    try {
      const saved = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as State;
      if (saved.schemaVersion !== SCHEMA_VERSION) throw new Error('schema changed');
      shiftTimestamps(saved, Date.now() - saved.savedAt);
      saved.savedAt = Date.now();
      this.state = saved;
      console.log(`[store] restored state from ${DB_FILE}`);
    } catch {
      this.state = buildInitialState();
      console.log('[store] seeded fresh state from /data');
      this.save();
    }
  }

  reset(): void {
    this.state = buildInitialState();
    this.flush();
  }

  save(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 1500);
  }

  flush(): void {
    this.state.savedAt = Date.now();
    this.state.feed = this.state.feed.slice(0, MAX_FEED);
    const cutoff = Date.now() - SNAPSHOT_RETENTION_MS;
    this.state.snapshots = this.state.snapshots.filter((s) => s.t >= cutoff);
    fs.mkdirSync(config.runtimeDir, { recursive: true });
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state));
    fs.renameSync(tmp, DB_FILE);
  }

  conversation(id: string): Conversation {
    const conv = this.state.conversations.find((c) => c.id === id);
    if (!conv) throw new HttpError(404, `Conversation ${id} not found`);
    return conv;
  }

  agent(id: string): Agent {
    const agent = this.state.agents.find((a) => a.id === id);
    if (!agent) throw new HttpError(404, `Agent ${id} not found`);
    return agent;
  }

  activeConversations(): Conversation[] {
    return this.state.conversations.filter((c) => c.status !== 'resolved');
  }
}

export const store = new Store();
