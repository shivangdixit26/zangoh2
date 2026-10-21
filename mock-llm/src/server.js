import express from 'express';
import { embed, EMBEDDING_DIM } from './embeddings.js';
import { generateCopilot, generateReply } from './generator.js';
import { estimateTokens } from './nlu.js';

const PORT = Number(process.env.PORT || 4001);
const BASE_LATENCY_MS = Number(process.env.MOCK_LLM_LATENCY_MS ?? 350);
const FAILURE_RATE = Number(process.env.MOCK_LLM_FAILURE_RATE ?? 0);

const app = express();
app.use(express.json({ limit: '1mb' }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requestCount = 0;

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mock-llm', requests: requestCount, embeddingDim: EMBEDDING_DIM });
});

app.get('/v1/models', (_req, res) => {
  res.json({
    object: 'list',
    data: ['csr-agent-v4.3', 'csr-agent-v4.2', 'supervisor-copilot-v1', 'mock-embed-256'].map((id) => ({ id, object: 'model', owned_by: 'zangoh-mock' })),
  });
});

// OpenAI-style chat completions. Extra behaviour knobs travel in `metadata` (persona, capabilities, context, task).
app.post('/v1/chat/completions', async (req, res) => {
  requestCount += 1;
  const body = req.body || {};
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: { message: '`messages` must be a non-empty array', type: 'invalid_request_error' } });
  }
  const temperature = Number(body.temperature ?? 0.7);
  const maxTokens = Number(body.max_tokens ?? 512);
  if (!(temperature >= 0 && temperature <= 2)) return res.status(400).json({ error: { message: '`temperature` must be between 0 and 2', type: 'invalid_request_error' } });
  if (!(maxTokens >= 1 && maxTokens <= 4096)) return res.status(400).json({ error: { message: '`max_tokens` must be between 1 and 4096', type: 'invalid_request_error' } });

  if (FAILURE_RATE > 0 && Math.random() < FAILURE_RATE) {
    await sleep(100);
    return res.status(503).json({ error: { message: 'Mock upstream overloaded, retry later', type: 'server_error' } });
  }

  const speed = Number(body.metadata?.persona?.responseSpeed ?? 0.5);
  const latency = BASE_LATENCY_MS > 0 ? BASE_LATENCY_MS * (0.6 + (1 - speed) * 1.4) + Math.random() * 150 : 0;
  await sleep(latency);

  const request = { ...body, temperature, max_tokens: maxTokens };
  const result = body.metadata?.task === 'copilot' ? generateCopilot(request) : generateReply(request);
  const promptTokens = body.messages.reduce((n, m) => n + estimateTokens(m.content), 0);
  const completionTokens = estimateTokens(result.content);

  res.json({
    id: `chatcmpl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: body.model || 'csr-agent-v4.3',
    choices: [{ index: 0, message: { role: 'assistant', content: result.content }, finish_reason: result.finishReason }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
    analysis: result.analysis,
    latency_ms: Math.round(latency),
  });
});

app.post('/v1/embeddings', (req, res) => {
  requestCount += 1;
  const input = req.body?.input;
  const inputs = Array.isArray(input) ? input : [input];
  if (!inputs.length || inputs.some((s) => typeof s !== 'string')) {
    return res.status(400).json({ error: { message: '`input` must be a string or array of strings', type: 'invalid_request_error' } });
  }
  res.json({
    object: 'list',
    model: 'mock-embed-256',
    data: inputs.map((text, index) => ({ object: 'embedding', index, embedding: embed(text) })),
    usage: { prompt_tokens: inputs.reduce((n, s) => n + estimateTokens(s), 0) },
  });
});

app.listen(PORT, () => {
  console.log(`[mock-llm] listening on http://localhost:${PORT} (latency ${BASE_LATENCY_MS}ms, failure rate ${FAILURE_RATE})`);
});
