import type {
  AgentConfig, AgentDetail, AgentListItem, Alert, ConversationDetail, ConversationSummary, Copilot, FeedEvent, Metrics, Preset,
  SimulationResult, Template, TemplateInput,
} from '../types';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

let supervisorName = 'Neha Prasad';
export const setApiSupervisor = (name: string) => { supervisorName = name; };

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-supervisor': supervisorName },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const details = data?.details;
    const detailMsg = Array.isArray(details) ? details.map((d: { message?: string }) => d.message ?? String(d)).filter(Boolean).join('; ') : '';
    throw new ApiError(res.status, detailMsg ? `${data?.error ?? 'Request failed'}: ${detailMsg}` : data?.error ?? `Request failed (${res.status})`, details);
  }
  return data as T;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][];
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
};

export const api = {
  health: () => request<{ services: { mockLlm: boolean; vectorDb: boolean }; knowledgeBase: { indexed: number; total: number } }>('GET', '/health'),

  conversations: (params: { status?: string; limit?: number; sort?: string } = {}) =>
    request<{ items: ConversationSummary[]; total: number }>('GET', `/conversations${qs(params)}`),
  conversation: (id: string) => request<ConversationDetail>('GET', `/conversations/${id}`),
  takeOver: (id: string) => request<ConversationDetail>('POST', `/conversations/${id}/takeover`, {}),
  returnToAi: (id: string, notes: string, shareWithAi: boolean) => request<ConversationDetail>('POST', `/conversations/${id}/return`, { notes, shareWithAi }),
  sendMessage: (id: string, text: string, templateId?: string | null, source: 'typed' | 'voice' | 'template' = 'typed') =>
    request<ConversationDetail>('POST', `/conversations/${id}/messages`, { text, templateId, source }),
  resolve: (id: string, notes?: string) => request<ConversationDetail>('POST', `/conversations/${id}/resolve`, { notes }),
  saveNotes: (id: string, notes: string) => request<{ ok: true }>('PUT', `/conversations/${id}/notes`, { notes }),
  copilot: (id: string, refresh = false) => request<Copilot>('GET', `/conversations/${id}/copilot${refresh ? '?refresh=1' : ''}`),
  approveCopilot: (id: string) => request<ConversationDetail>('POST', `/conversations/${id}/copilot/approve`, {}),
  escalatePolicy: (id: string) => request<ConversationDetail>('POST', `/conversations/${id}/escalate-policy`, {}),

  alerts: () => request<{ items: Alert[] }>('GET', '/alerts'),
  ackAlert: (id: string) => request<Alert>('POST', `/alerts/${id}/ack`, {}),
  ackAll: () => request<{ acknowledged: number }>('POST', '/alerts/ack-all', {}),
  feed: (limit = 40) => request<{ items: FeedEvent[] }>('GET', `/feed?limit=${limit}`),
  metrics: (range: number, region: string) => request<Metrics>('GET', `/metrics${qs({ range, region })}`),
  metricsStreamUrl: (range: number, region: string, interval = 2000) => `/api/metrics/stream${qs({ range, region, interval })}`,
  search: (q: string) => request<{
    conversations: { id: string; name: string; caseNumber: string; topic: string; status: string; priority: string }[];
    agents: { id: string; name: string; version: string; description: string }[];
    templates: { id: string; name: string; category: string }[];
  }>('GET', `/search${qs({ q })}`),
  exportUrl: (range: number, region: string) => `/api/export/report.csv${qs({ range, region })}`,
  knowledgeSearch: (q: string, agentId: string) => request<{ results: { id: string; title: string; content: string; source: string; score: number }[]; sources: string[] }>('GET', `/knowledge/search${qs({ q, agentId })}`),

  agents: () => request<{ items: AgentListItem[] }>('GET', '/agents'),
  agent: (id: string) => request<AgentDetail>('GET', `/agents/${id}`),
  saveDraft: (id: string, config: AgentConfig) => request<{ draft: AgentDetail['draft'] }>('PUT', `/agents/${id}/draft`, { config }),
  discardDraft: (id: string) => request<{ ok: true }>('DELETE', `/agents/${id}/draft`),
  deploy: (id: string) => request<{ version: string; changes: unknown[] }>('POST', `/agents/${id}/deploy`, {}),
  simulate: (id: string, index: number, target: 'draft' | 'deployed' | 'previous') => request<SimulationResult>('POST', `/agents/${id}/simulate`, { index, target }),
  runEvals: (id: string, target: 'draft' | 'deployed') => request<{ suite: { key: string; label: string; score: number }[]; failures: { id: string; prompt: string; score: number; improve: string[] }[] }>('POST', `/agents/${id}/evals`, { target }),

  presets: () => request<{ items: Preset[] }>('GET', '/presets'),
  createPreset: (name: string, description: string, config: AgentConfig) => request<Preset>('POST', '/presets', { name, description, config }),
  deletePreset: (id: string) => request<{ ok: true }>('DELETE', `/presets/${id}`),

  templates: () => request<{ items: Template[]; total: number }>('GET', '/templates'),
  createTemplate: (input: TemplateInput) => request<Template>('POST', '/templates', input),
  updateTemplate: (id: string, input: TemplateInput) => request<Template>('PUT', `/templates/${id}`, input),
  deleteTemplate: (id: string) => request<{ ok: true }>('DELETE', `/templates/${id}`),
  favoriteTemplate: (id: string, favorite: boolean) => request<Template>('POST', `/templates/${id}/favorite`, { favorite }),

  simulator: () => request<{ running: boolean; speed: number }>('GET', '/simulator'),
  setSimulator: (patch: { running?: boolean; speed?: number }) => request<{ running: boolean; speed: number }>('PUT', '/simulator', patch),
  spawn: () => request<ConversationSummary>('POST', '/simulator/spawn', {}),
  reset: () => request<{ ok: true }>('POST', '/admin/reset', {}),
};
