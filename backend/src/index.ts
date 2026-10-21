import cors from 'cors';
import express from 'express';
import http from 'node:http';
import { config } from './config.ts';
import { initSockets } from './events.ts';
import { errorMiddleware } from './lib/http.ts';
import { agentsRouter, presetsRouter } from './routes/agents.ts';
import { conversationsRouter } from './routes/conversations.ts';
import { systemRouter } from './routes/system.ts';
import { templatesRouter } from './routes/templates.ts';
import { syncAlerts } from './services/alerts.ts';
import { indexKnowledgeBase } from './services/knowledge.ts';
import { startSimulator } from './services/simulator.ts';
import { store } from './store.ts';

store.load();

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/conversations', conversationsRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/presets', presetsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api', systemRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorMiddleware);

const server = http.createServer(app);
initSockets(server);

server.listen(config.port, () => {
  console.log(`[api] listening on http://localhost:${config.port} (mock LLM ${config.mockLlmUrl}, vector DB ${config.vectorDbUrl})`);
  syncAlerts();
  void indexKnowledgeBase();
  startSimulator();
});

const shutdown = () => {
  console.log('[api] shutting down, flushing state');
  store.flush();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
