import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { attempt } from '../../store/live';
import type { ConversationSummary } from '../../types';
import { Button, IconButton, Spinner } from '../ui';

/** Co-pilot recommendation: a next-best action the supervisor can approve, edit or escalate. */
export function CopilotCard({ conv, onEdit }: { conv: ConversationSummary; onEdit: (text: string) => void }) {
  // The backend invalidates the recommendation whenever the customer says something new.
  const lastCustomerTs = conv.lastMessage?.role === 'customer' ? conv.lastMessage.ts : conv.waitingSince ?? 0;
  const { data: rec, loading, reload, setData } = useAsync(() => api.copilot(conv.id), [conv.id, lastCustomerTs]);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(key);
    await attempt(fn, msg);
    setBusy(null);
  };

  return (
    <div className="rounded-2xl border border-line bg-[#f8f6fb] px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-semibold text-ink">Co-pilot recommendation</h3>
          <p className="text-[11.5px] text-muted">Generated from policy, customer tier, and conversation sentiment</p>
        </div>
        <IconButton label="Regenerate recommendation" onClick={() => { setData(undefined); api.copilot(conv.id, true).then(setData).catch(reload); }} className="size-8 text-muted hover:bg-white">
          <RefreshCw className="size-4" />
        </IconButton>
      </div>
      {!rec ? (
        <div className="flex h-20 items-center justify-center">{loading ? <Spinner /> : <p className="text-xs text-muted">No recommendation available.</p>}</div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] text-ink">{rec.summary}</p>
              <p className="mt-1.5 text-[11px] text-muted">
                Evidence: {rec.evidence.join(' • ')}{rec.policy ? ` • policy ${rec.policy.id}` : ''}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-3 py-1 text-xs font-semibold text-ok-ink">
              <span className="size-2 rounded-full bg-ok" />Confidence {Math.round(rec.confidence * 100)}%
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" className="h-9 px-6" loading={busy === 'approve'} onClick={() => run('approve', () => api.approveCopilot(conv.id), 'Action approved and sent')}>Approve action</Button>
            <Button size="sm" variant="secondary" className="h-9 px-6" onClick={() => onEdit(rec.suggestedReply)}>Edit response</Button>
            <Button size="sm" variant="secondary" className="h-9 px-6" loading={busy === 'escalate'} onClick={() => run('escalate', () => api.escalatePolicy(conv.id), 'Escalated to Ops Governance')}>Escalate policy</Button>
          </div>
        </>
      )}
    </div>
  );
}
