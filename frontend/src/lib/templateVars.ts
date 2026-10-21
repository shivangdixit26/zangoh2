import type { ConversationSummary } from '../types';
import { money } from './format';

/**
 * Template variables are written as {{snake_case}} placeholders.
 * Everything a supervisor sees about substitution (chips, counts, warnings) is derived from these helpers.
 */
export interface VariableDef { key: string; label: string; sample: string }

export const VARIABLES: VariableDef[] = [
  { key: 'user_name', label: 'Customer first name', sample: 'Avery' },
  { key: 'full_name', label: 'Customer full name', sample: 'Avery Johnson' },
  { key: 'company_name', label: 'Company name', sample: 'ABC Company' },
  { key: 'case_id', label: 'Case ID', sample: '#84291' },
  { key: 'order_id', label: 'Order ID', sample: 'ORD-55231' },
  { key: 'refund_amount', label: 'Refund amount', sample: '₹8,420' },
  { key: 'agent_name', label: 'Supervisor name', sample: 'Neha Prasad' },
  { key: 'delivery_date', label: 'Delivery date', sample: 'Fri, 24 Oct' },
  { key: 'follow_up_time', label: 'Follow-up time', sample: '5 pm today' },
  { key: 'tracking_link', label: 'Tracking link', sample: 'abc.co/t/55231' },
];
export const VARIABLE_MAP = Object.fromEntries(VARIABLES.map((v) => [v.key, v]));
export const COMPANY_NAME = 'ABC Company';

export const varLabel = (key: string) => VARIABLE_MAP[key]?.label ?? key.replace(/_/g, ' ');
/** How the design shows an unfilled placeholder: <user name>. */
export const placeholderText = (key: string) => `‹${key.replace(/_/g, ' ')}›`;

export type Segment =
  | { type: 'text'; value: string }
  | { type: 'var'; key: string; raw: string };

const VAR_RE = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;

export function parseSegments(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(VAR_RE)) {
    if (m.index! > last) out.push({ type: 'text', value: text.slice(last, m.index) });
    out.push({ type: 'var', key: m[1], raw: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

export const extractVariables = (text: string) => [...new Set([...text.matchAll(VAR_RE)].map((m) => m[1]))];
export const unknownVariables = (text: string) => extractVariables(text).filter((k) => !VARIABLE_MAP[k]);

/** Malformed placeholders the backend would reject. */
export function variableProblems(text: string): string[] {
  const problems: string[] = [];
  for (const m of text.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)) {
    if (!/^[a-z][a-z0-9_]*$/.test(m[1])) problems.push(`"${m[0]}" isn't a valid variable, use lower_snake_case like {{user_name}}`);
  }
  const stripped = text.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, '');
  if (stripped.includes('{{') || stripped.includes('}}')) problems.push('A variable is missing its opening or closing braces');
  return problems;
}

export type VarValues = Record<string, string | undefined>;

/** Values known from a live conversation. Anything not listed must be typed in by the supervisor. */
export function conversationValues(conv: ConversationSummary, supervisor: string): VarValues {
  return {
    user_name: conv.customer.name.split(/\s+/)[0],
    full_name: conv.customer.name,
    company_name: COMPANY_NAME,
    case_id: `#${conv.caseNumber}`,
    order_id: conv.orderId ?? undefined,
    refund_amount: conv.refundAmount != null ? money(conv.refundAmount) : undefined,
    agent_name: supervisor,
  };
}

export interface Persona { id: string; label: string; values: VarValues }

export const PERSONAS: Persona[] = [
  { id: 'new_visitor', label: 'New visitor', values: { user_name: 'Avery', full_name: 'Avery Johnson', company_name: COMPANY_NAME } },
  { id: 'returning', label: 'Returning customer', values: { user_name: 'Jordan', full_name: 'Jordan Patel', company_name: COMPANY_NAME, case_id: '#84302', order_id: 'ORD-55102', refund_amount: '₹2,150', agent_name: 'Neha Prasad' } },
  { id: 'vip', label: 'VIP customer', values: { user_name: 'Elena', full_name: 'Elena Vasquez', company_name: COMPANY_NAME, case_id: '#84291', order_id: 'ORD-55231', refund_amount: '₹8,420', agent_name: 'Neha Prasad', delivery_date: 'Fri, 24 Oct', follow_up_time: '5 pm today' } },
];

export interface Resolution {
  /** Text with every known variable substituted; unknown ones are left as {{key}}. */
  text: string;
  resolved: string[];
  missing: string[];
}

export function resolveTemplate(text: string, values: VarValues): Resolution {
  const resolved = new Set<string>();
  const missing = new Set<string>();
  const out = text.replace(VAR_RE, (raw, key: string) => {
    const v = values[key]?.trim();
    if (v) { resolved.add(key); return v; }
    missing.add(key);
    return raw;
  });
  return { text: out, resolved: [...resolved], missing: [...missing] };
}

/** "Customer first name and company name" style summary used in the preview status box. */
export function humanList(keys: string[]): string {
  const labels = keys.map((k) => varLabel(k).toLowerCase());
  if (labels.length <= 1) return labels.join('');
  const first = labels[0].charAt(0).toUpperCase() + labels[0].slice(1);
  return [first, ...labels.slice(1, -1)].join(', ') + ` and ${labels[labels.length - 1]}`;
}

/** The composer is plain text: drop the light markdown used for formatting in templates. */
export function toPlainText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1$2');
}
