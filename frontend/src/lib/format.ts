export function money(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

/** Indian short scale used in the design: ₹1.24L, ₹2.1Cr. */
export function moneyShort(amount: number): string {
  if (amount >= 1e7) return `₹${(amount / 1e7).toFixed(2).replace(/\.?0+$/, '')}Cr`;
  if (amount >= 1e5) return `₹${(amount / 1e5).toFixed(2).replace(/\.?0+$/, '')}L`;
  if (amount >= 1e3) return `₹${(amount / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return `₹${Math.round(amount)}`;
}

/** mm:ss (or h:mm:ss past an hour). */
export function duration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return h ? `${h}:${mmss}` : mmss;
}

export const clock = (ts: number) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const clockShort = (ts: number) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export const signed = (n: number, digits = 2) => (n < 0 ? `−${Math.abs(n).toFixed(digits)}` : n.toFixed(digits));

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

export const shortName = (name: string) => {
  const [first, last] = name.split(/\s+/);
  return last ? `${first} ${last[0]}.` : first;
};

export const QUEUE_LABEL: Record<string, string> = {
  Refund: 'Returns',
  Delivery: 'Delivery',
  Account: 'Account',
  Product: 'Product',
  Billing: 'Billing',
};

export const ACTION_LABEL: Record<string, string> = {
  take_over: 'Take over',
  approve_override: 'Approve override',
  review_evidence: 'Review evidence',
  monitor: 'Monitor',
  send_template: 'Send template',
  none: '—',
};

export const AGENT_LABEL: Record<string, string> = {
  'csr-returns': 'CSR-Returns',
  'csr-identity': 'CSR-Identity',
  'csr-logistics': 'CSR-Logistics',
  'csr-tech': 'CSR-Tech',
  'csr-finance': 'CSR-Finance',
};

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
