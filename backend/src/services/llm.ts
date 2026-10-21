import { config } from '../config.ts';

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface LlmAnalysis {
  task: string;
  intent: string;
  intentScore: number;
  sentiment: number;
  sentimentLabel: string;
  urgent: boolean;
  confidence: number;
  amount: number | null;
  citations: { id: string; title: string; score?: number }[];
  escalate: boolean;
  escalationReason: string | null;
  closing: boolean;
  fallback: boolean;
  flagged: boolean;
  effectiveTemperature: number;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  max_tokens: number;
  metadata: Record<string, unknown>;
}

export interface ChatResponse {
  content: string;
  finishReason: string;
  analysis: LlmAnalysis;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  latencyMs: number;
}

export class UpstreamError extends Error {}

async function postJson<T>(url: string, body: unknown, timeoutMs: number): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new UpstreamError(`${url} responded ${res.status}: ${await res.text().catch(() => '')}`);
  return (await res.json()) as T;
}

/** Chat completion with one retry, so a transient 503 from the model doesn't drop a customer reply. */
export async function chatCompletion(req: ChatRequest, attempts = 2): Promise<ChatResponse> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const started = Date.now();
      const data = await postJson<{
        choices: { message: { content: string }; finish_reason: string }[];
        analysis: LlmAnalysis;
        usage: ChatResponse['usage'];
      }>(`${config.mockLlmUrl}/v1/chat/completions`, req, 15_000);
      return {
        content: data.choices[0]?.message.content ?? '',
        finishReason: data.choices[0]?.finish_reason ?? 'stop',
        analysis: data.analysis,
        usage: data.usage,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new UpstreamError(String(lastError));
}

export async function embed(texts: string[]): Promise<number[][]> {
  const data = await postJson<{ data: { embedding: number[]; index: number }[] }>(`${config.mockLlmUrl}/v1/embeddings`, { input: texts, model: 'mock-embed-256' }, 10_000);
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function serviceHealth(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
