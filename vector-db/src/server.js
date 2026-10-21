import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 4002);
const PERSIST_PATH = process.env.VECTOR_DB_PERSIST || path.resolve('runtime', 'vectors.json');

/** @type {Map<string, { dimension: number, points: Map<string, { vector: number[], payload: object }> }>} */
const collections = new Map();

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(PERSIST_PATH, 'utf8'));
    for (const [name, col] of Object.entries(raw)) {
      collections.set(name, { dimension: col.dimension, points: new Map(Object.entries(col.points)) });
    }
    console.log(`[vector-db] restored ${collections.size} collection(s) from ${PERSIST_PATH}`);
  } catch {
    // First boot or unreadable snapshot: start empty, the backend re-indexes on startup.
  }
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const out = {};
    for (const [name, col] of collections) out[name] = { dimension: col.dimension, points: Object.fromEntries(col.points) };
    fs.mkdirSync(path.dirname(PERSIST_PATH), { recursive: true });
    fs.writeFile(PERSIST_PATH, JSON.stringify(out), (err) => err && console.error('[vector-db] persist failed', err.message));
  }, 500);
}

function cosine(a, b) {
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function matchesFilter(payload, filter) {
  if (!filter) return true;
  return Object.entries(filter).every(([k, v]) => (Array.isArray(v) ? v.includes(payload?.[k]) : payload?.[k] === v));
}

const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'vector-db', collections: collections.size }));

app.get('/collections', (_req, res) => {
  res.json({ collections: [...collections].map(([name, c]) => ({ name, dimension: c.dimension, count: c.points.size })) });
});

app.get('/collections/:name', (req, res) => {
  const col = collections.get(req.params.name);
  if (!col) return res.status(404).json({ error: 'collection not found' });
  res.json({ name: req.params.name, dimension: col.dimension, count: col.points.size });
});

app.put('/collections/:name', (req, res) => {
  const dimension = Number(req.body?.dimension);
  if (!Number.isInteger(dimension) || dimension <= 0) return res.status(400).json({ error: '`dimension` must be a positive integer' });
  const existing = collections.get(req.params.name);
  if (existing && existing.dimension !== dimension) return res.status(409).json({ error: `collection exists with dimension ${existing.dimension}` });
  if (!existing) collections.set(req.params.name, { dimension, points: new Map() });
  scheduleSave();
  res.status(existing ? 200 : 201).json({ name: req.params.name, dimension, created: !existing });
});

app.delete('/collections/:name', (req, res) => {
  const deleted = collections.delete(req.params.name);
  scheduleSave();
  res.json({ deleted });
});

app.post('/collections/:name/points', (req, res) => {
  const col = collections.get(req.params.name);
  if (!col) return res.status(404).json({ error: 'collection not found' });
  const points = req.body?.points;
  if (!Array.isArray(points)) return res.status(400).json({ error: '`points` must be an array' });
  for (const p of points) {
    if (!p?.id || !Array.isArray(p.vector) || p.vector.length !== col.dimension) {
      return res.status(400).json({ error: `each point needs an id and a ${col.dimension}-dim vector` });
    }
  }
  for (const p of points) col.points.set(String(p.id), { vector: p.vector, payload: p.payload ?? {} });
  scheduleSave();
  res.json({ upserted: points.length, count: col.points.size });
});

app.post('/collections/:name/query', (req, res) => {
  const col = collections.get(req.params.name);
  if (!col) return res.status(404).json({ error: 'collection not found' });
  const { vector, topK = 3, filter, minScore = 0 } = req.body || {};
  if (!Array.isArray(vector) || vector.length !== col.dimension) return res.status(400).json({ error: `\`vector\` must have ${col.dimension} dimensions` });
  const results = [];
  for (const [id, p] of col.points) {
    if (!matchesFilter(p.payload, filter)) continue;
    const score = cosine(vector, p.vector);
    if (score >= minScore) results.push({ id, score: Number(score.toFixed(4)), payload: p.payload });
  }
  results.sort((a, b) => b.score - a.score);
  res.json({ results: results.slice(0, Math.max(1, Math.min(50, Number(topK)))) });
});

load();
app.listen(PORT, () => console.log(`[vector-db] listening on http://localhost:${PORT}`));
