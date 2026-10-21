import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { AGENT_LABEL } from '../../lib/format';
import { attempt } from '../../store/live';
import type { ConversationSummary } from '../../types';
import { Button, Modal } from '../ui';

/** Hand control back to the AI with notes that (optionally) become context for its next replies. */
export function ReturnToAiModal({ open, onClose, conv }: { open: boolean; onClose: () => void; conv: ConversationSummary }) {
  const [notes, setNotes] = useState('');
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);

  // Prefill from the feedback notes each time the modal opens.
  useEffect(() => {
    if (open) { setNotes(conv.feedbackNotes); setShare(true); }
  }, [open]);

  const submit = async () => {
    setBusy(true);
    const ok = await attempt(() => api.returnToAi(conv.id, notes, share), `Control returned to ${AGENT_LABEL[conv.agentId] ?? 'the AI'}`);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Return control to AI" footer={(
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={busy}>Return to AI</Button>
      </>
    )}>
      <p className="text-sm text-ink-soft">{AGENT_LABEL[conv.agentId] ?? 'The AI agent'} resumes the conversation with {conv.customer.name.split(' ')[0]} and picks up from your last message.</p>
      <label htmlFor="handoff-notes" className="mt-4 block text-[13px] font-semibold text-ink">Handoff notes</label>
      <textarea
        id="handoff-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={5}
        autoFocus
        placeholder="e.g. Refund of ₹8,420 approved. Confirm the 24h timeline and close if the customer is happy."
        className="mt-1.5 w-full resize-none rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-brand-300"
      />
      <label className="mt-3 flex items-start gap-2.5 text-sm text-ink">
        <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-brand-700)]" />
        <span>
          Share notes with the AI as context
          <span className="block text-xs text-muted">Notes stay internal and are never shown to the customer.</span>
        </span>
      </label>
    </Modal>
  );
}
