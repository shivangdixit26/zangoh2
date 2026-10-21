import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT ?? 4000),
  mockLlmUrl: process.env.MOCK_LLM_URL ?? 'http://localhost:4001',
  vectorDbUrl: process.env.VECTOR_DB_URL ?? 'http://localhost:4002',
  dataDir: process.env.DATA_DIR ?? path.resolve(here, '../../data'),
  runtimeDir: process.env.RUNTIME_DIR ?? path.resolve(here, '../runtime'),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  simTickMs: Number(process.env.SIM_TICK_MS ?? 3000),
  simulatorEnabled: process.env.SIMULATOR !== 'off',
  companyName: process.env.COMPANY_NAME ?? 'ABC Company',
  defaultSupervisor: 'Neha Prasad',
  // Company refund policy (REF-12.4). Evaluations grade agents against this, whatever their configured threshold is.
  policyRefundLimit: 5000,
  kbCollection: 'knowledge-base',
};
