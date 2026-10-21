// Domain model shared by the store, services and routes. All timestamps are epoch milliseconds.

export type Role = 'customer' | 'ai' | 'supervisor' | 'system' | 'note';
export type ConversationStatus = 'active' | 'escalated' | 'resolved';
export type Control = 'ai' | 'supervisor';
export type Priority = 'critical' | 'high' | 'watch' | 'normal';
export type Queue = 'Refund' | 'Account' | 'Delivery' | 'Product' | 'Billing';

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
    /** How a supervisor composed the message. */
    source?: 'typed' | 'voice' | 'template' | 'copilot';
    confidence?: number;
    intent?: string;
    citations?: { id: string; title: string; score?: number }[];
    finishReason?: string;
    escalate?: boolean;
    visibleToCustomer?: boolean;
  };
}

export interface Diagnostics {
  repeatContact: number;
  negativeSentiment: number;
  policyException: number;
  churnPropensity: number;
}

export interface CopilotRecommendation {
  action: string;
  summary: string;
  evidence: string[];
  suggestedReply: string;
  confidence: number;
  policy?: { id: string; title: string };
  generatedAt: number;
}

export type RecommendedAction = 'take_over' | 'approve_override' | 'review_evidence' | 'monitor' | 'send_template' | 'none';

export interface Conversation {
  id: string;
  caseNumber: string;
  customer: Customer;
  topic: string;
  queue: Queue;
  channel: string;
  agentId: string;
  status: ConversationStatus;
  control: Control;
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
  diagnostics: Diagnostics;
  evidence: string[];
  feedbackNotes: string;
  handoffNotes: { ts: number; author: string; text: string; sharedWithAi: boolean }[];
  copilot?: CopilotRecommendation | null;
  messages: Message[];
  historical?: boolean;
}

export type AlertRule = 'sla' | 'sentiment' | 'confidence' | 'refund_value' | 'no_response' | 'sla_cluster' | 'sentiment_anomaly' | 'agent_degradation';
export type Severity = 'critical' | 'warning';

export interface Alert {
  id: string;
  key: string;
  rule: AlertRule;
  severity: Severity;
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

export type FeedTone = 'critical' | 'warning' | 'info' | 'success';
export interface FeedEvent {
  id: string;
  ts: number;
  kind: string;
  title: string;
  detail: string;
  tone: FeedTone;
  conversationId?: string | null;
}

export interface AgentParameters {
  temperature: number;
  maxTokens: number;
  responseSpeed: number;
  empathy: number;
  stability: number;
}
export interface AgentCapabilities {
  refunds: boolean;
  orderLookup: boolean;
  knowledgeBase: boolean;
  autoEscalate: boolean;
  accountChanges: boolean;
  proactiveCredits: boolean;
  multilingual: boolean;
}
export type KnowledgeSources = Record<string, boolean>;
export interface EscalationPolicy {
  noAgentResponseSec: number;
  sentimentThreshold: number;
  refundValueThreshold: number;
  confidenceThreshold: number;
}
export interface AgentConfig {
  parameters: AgentParameters;
  capabilities: AgentCapabilities;
  knowledge: KnowledgeSources;
  escalation: EscalationPolicy;
}

export interface EvalResults {
  policy: number;
  refund: number;
  empathy: number;
  injection: number;
  knowledge: number;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  queue: Queue;
  version: string;
  deployedAt: number;
  config: AgentConfig;
  previous: { version: string; config: AgentConfig } | null;
  routing: { intent: string; model: string; tier: string; traffic: string; failover: string }[];
  stats: { fallbackRate: number; hallucinationRate: number; prevFallbackRate: number; prevHallucinationRate: number };
  evals: { scenarios: number; results: EvalResults; ranAt: number; configVersion: string };
}

export interface Draft {
  config: AgentConfig;
  updatedAt: number;
  updatedBy: string;
  changeRequest: string;
  evals?: Agent['evals'];
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
  /** Scenario category, e.g. Shipping, Returns, Billing (custom values allowed). */
  category: string;
  /** Message format: Chat, Email or SMS. */
  type: string;
  channels: string[];
  content: string;
  cta: string | null;
  /** Supervisors who starred this template (favourites are personal). */
  favoriteBy: string[];
  uses: number;
  lastUsedAt: number | null;
  shared: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface Snapshot {
  t: number;
  active: number;
  atRisk: number;
  byRegion: Record<string, [number, number]>;
}

export interface SimulatorSettings {
  running: boolean;
  speed: number;
}

export interface State {
  schemaVersion: number;
  savedAt: number;
  conversations: Conversation[];
  alerts: Alert[];
  feed: FeedEvent[];
  agents: Agent[];
  drafts: Record<string, Draft>;
  presets: Preset[];
  templates: Template[];
  snapshots: Snapshot[];
  simulator: SimulatorSettings;
  counters: { case: number; changeRequest: number };
}
