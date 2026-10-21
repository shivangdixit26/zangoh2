// Mirrors backend/src/types.ts (API contract). Timestamps are epoch milliseconds.

export type Role = 'customer' | 'ai' | 'supervisor' | 'system' | 'note';
export type Priority = 'critical' | 'high' | 'watch' | 'normal';
export type RecommendedAction = 'take_over' | 'approve_override' | 'review_evidence' | 'monitor' | 'send_template' | 'none';

export interface Customer {
  id: string;
  name: string;
  tier: 'VIP' | 'Standard';
  tenureYears: number;
  location: string;
  region: string;
  language: string;
  lifetimeValue: number;
  orders: number;
  returnRate: number;
}

export interface Message {
  id: string;
  role: Role;
  text: string;
  ts: number;
  author?: string;
  meta?: {
    templateId?: string;
    templateName?: string;
    cta?: string | null;
    source?: 'typed' | 'voice' | 'template' | 'copilot';
    confidence?: number;
    intent?: string;
    citations?: { id: string; title: string; score?: number }[];
    finishReason?: string;
    escalate?: boolean;
    visibleToCustomer?: boolean;
  };
}

export interface ConversationSummary {
  id: string;
  caseNumber: string;
  customer: Customer;
  topic: string;
  queue: string;
  channel: string;
  agentId: string;
  status: 'active' | 'escalated' | 'resolved';
  control: 'ai' | 'supervisor';
  supervisor?: string | null;
  takenOverAt?: number | null;
  startedAt: number;
  slaDueAt: number;
  firstResponseAt?: number | null;
  resolvedAt?: number | null;
  resolvedBy?: 'ai' | 'supervisor' | null;
  csat?: number | null;
  sentiment: number;
  aiConfidence: number;
  risk: number;
  priority: Priority;
  orderId?: string | null;
  refundAmount?: number | null;
  diagnostics: { repeatContact: number; negativeSentiment: number; policyException: number; churnPropensity: number };
  evidence: string[];
  feedbackNotes: string;
  handoffNotes: { ts: number; author: string; text: string; sharedWithAi: boolean }[];
  messageCount: number;
  lastMessage: Pick<Message, 'role' | 'text' | 'ts'> | null;
  waitingSince: number | null;
  recommendedAction: RecommendedAction;
}

export interface ConversationDetail extends ConversationSummary {
  messages: Message[];
}

export interface Copilot {
  action: string;
  summary: string;
  evidence: string[];
  suggestedReply: string;
  confidence: number;
  policy?: { id: string; title: string };
  generatedAt: number;
}

export interface Alert {
  id: string;
  key: string;
  rule: 'sla' | 'sentiment' | 'confidence' | 'refund_value' | 'no_response' | 'sla_cluster' | 'sentiment_anomaly' | 'agent_degradation';
  severity: 'critical' | 'warning';
  title: string;
  detail: string;
  conversationId?: string | null;
  queue?: string | null;
  agentId?: string | null;
  status: 'open' | 'acknowledged' | 'cleared';
  createdAt: number;
  updatedAt: number;
  acknowledgedBy?: string | null;
}

export interface FeedEvent {
  id: string;
  ts: number;
  kind: string;
  title: string;
  detail: string;
  tone: 'critical' | 'warning' | 'info' | 'success';
  conversationId?: string | null;
}

export interface Kpi { value: number | null; delta?: number | null }

export interface Metrics {
  generatedAt: number;
  /** Present on Server-Sent Events frames. */
  intervalMs?: number;
  seq?: number;
  rangeMin: number;
  region: string;
  scope: { queues: number; regions: number; agents: number; regionList: string[] };
  kpis: {
    activeLoad: Kpi;
    slaAtRisk: Kpi;
    containment: Kpi & { resolved: number };
    avgHandleSec: Kpi;
    firstResponseSec: Kpi;
    csat: Kpi & { responses: number };
  };
  series: { bucketMin: number; points: { t: number; live: number; exposure: number }[] };
  queues: { queue: string; label: string; probability: number; status: 'critical' | 'watch' | 'elevated' | 'healthy'; active: number }[];
}

export interface AgentConfig {
  parameters: { temperature: number; maxTokens: number; responseSpeed: number; empathy: number; stability: number };
  capabilities: { refunds: boolean; orderLookup: boolean; knowledgeBase: boolean; autoEscalate: boolean; accountChanges: boolean; proactiveCredits: boolean; multilingual: boolean };
  knowledge: Record<string, boolean>;
  escalation: { noAgentResponseSec: number; sentimentThreshold: number; refundValueThreshold: number; confidenceThreshold: number };
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  queue: string;
  version: string;
  deployedAt: number;
  config: AgentConfig;
  previous: { version: string; config: AgentConfig } | null;
  routing: { intent: string; model: string; tier: string; traffic: string; failover: string }[];
  stats: { fallbackRate: number; hallucinationRate: number };
}

export interface AgentListItem {
  id: string;
  name: string;
  description: string;
  queue: string;
  version: string;
  deployedAt: number;
  hasDraft: boolean;
  activeConversations: number;
}

export interface ConfigChange { path: string; label: string; from: unknown; to: unknown }

export interface Draft {
  config: AgentConfig;
  updatedAt: number;
  updatedBy: string;
  changeRequest: string;
  changes: ConfigChange[];
  risk: { level: 'Low' | 'Moderate' | 'High'; reasons: string[] };
  evals?: { ranAt: number; configVersion: string };
}

export interface EvalSuite {
  scenarios: number;
  ranAt: number;
  configVersion: string;
  suite: { key: string; label: string; score: number }[];
}

export interface AgentDetail {
  agent: Agent;
  draft: Draft | null;
  performance: {
    containment: Kpi;
    csat: Kpi;
    fallback: Kpi;
    hallucination: Kpi;
    resolved: number;
  };
  evals: EvalSuite;
}

export interface SimulationResult {
  scenario: { id: string; category: string; prompt: string; tier: string };
  index: number;
  total: number;
  versionLabel: string;
  response: string;
  finishReason: string;
  tags: string[];
  trace: { label: string; value: string }[];
  score: number;
  verdict: 'PASS' | 'FAIL';
  feedback: { strengths: string[]; improve: string[] };
  latencyMs: number;
  tokens: number;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
  config: AgentConfig;
  createdBy?: string;
  createdAt: number;
}

export interface Template {
  id: string;
  name: string;
  title: string;
  /** Scenario category: Shipping, Returns, Billing, … (custom values allowed). */
  category: string;
  /** Message format: Chat, Email or SMS. */
  type: 'Chat' | 'Email' | 'SMS';
  channels: string[];
  content: string;
  cta: string | null;
  favorite: boolean;
  canEdit: boolean;
  uses: number;
  lastUsedAt: number | null;
  shared: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type TemplateInput = Pick<Template, 'name' | 'title' | 'category' | 'type' | 'channels' | 'content' | 'cta' | 'shared'>;
