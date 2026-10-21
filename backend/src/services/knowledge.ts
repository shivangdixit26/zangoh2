import { config } from '../config.ts';
import { loadKnowledgeBase, type KbDoc } from '../seed.ts';
import { embed } from './llm.ts';

export interface RetrievedDoc { id: string; title: string; content: string; source: string; score: number }

const base = () => `${config.vectorDbUrl}/collections/${config.kbCollection}`;

async function request<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`vector-db ${method} ${url} -> ${res.status}`);
  return (await res.json()) as T;
}

let indexed = 0;
export const kbStatus = () => ({ indexed, total: loadKnowledgeBase().length });

/** Embed the knowledge base and upsert it into the vector DB. Idempotent; retries until both services are up. */
export async function indexKnowledgeBase(maxAttempts = 30): Promise<void> {
  const docs: KbDoc[] = loadKnowledgeBase();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const vectors = await embed(docs.map((d) => `${d.title}. ${d.content}`));
      await request(base(), 'PUT', { dimension: vectors[0].length });
      await request(`${base()}/points`, 'POST', {
        points: docs.map((d, i) => ({ id: d.id, vector: vectors[i], payload: { title: d.title, content: d.content, source: d.source } })),
      });
      indexed = docs.length;
      console.log(`[kb] indexed ${docs.length} knowledge-base documents into the vector DB`);
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        console.warn('[kb] giving up on indexing:', (err as Error).message);
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

/** Top-k semantic search restricted to the knowledge sources the agent is allowed to use. */
export async function retrieve(query: string, sources: string[], topK = 3): Promise<RetrievedDoc[]> {
  if (!query.trim() || !sources.length) return [];
  try {
    const [vector] = await embed([query]);
    const data = await request<{ results: { id: string; score: number; payload: { title: string; content: string; source: string } }[] }>(
      `${base()}/query`, 'POST', { vector, topK, filter: { source: sources }, minScore: 0.05 },
    );
    return data.results.map((r) => ({ id: r.id, score: r.score, ...r.payload }));
  } catch (err) {
    console.warn('[kb] retrieval failed, continuing without context:', (err as Error).message);
    return [];
  }
}
