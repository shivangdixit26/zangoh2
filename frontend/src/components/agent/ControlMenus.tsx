import { ArrowRight, ChevronDown, Layers, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { cx } from '../../lib/format';
import { useAsync, useClickOutside } from '../../lib/hooks';
import { attempt, useLive } from '../../store/live';
import type { AgentConfig, AgentDetail, ConfigChange } from '../../types';
import { Badge, Button, Modal, type Tone } from '../ui';

export function AgentSwitcher({ current }: { current: AgentDetail['agent'] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);
  const { data } = useAsync(() => api.agents(), [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} className="group flex items-center gap-2 text-left">
        <h1 className="text-[26px] font-semibold tracking-tight text-ink">{current.name} · Control Room</h1>
        <ChevronDown className="size-5 text-muted transition-transform group-hover:text-ink" />
      </button>
      {open && (
        <div className="slide-in absolute left-0 top-11 z-40 w-80 rounded-2xl border border-line bg-white p-1.5 shadow-pop">
          {data?.items.map((a) => (
            <button key={a.id} onClick={() => { navigate(`/agents/${a.id}`); setOpen(false); }} className={cx('flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-brand-50', a.id === current.id && 'bg-brand-50')}>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{a.name} <span className="font-normal text-muted">v{a.version}</span></span>
                <span className="block truncate text-xs text-muted">{a.description}</span>
                <span className="block text-[11px] text-ink-soft">{a.activeConversations} live conversation{a.activeConversations === 1 ? '' : 's'}</span>
              </span>
              {a.hasDraft && <Badge tone="warn">Draft</Badge>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PresetsMenu({ cfg, onApply }: { cfg: AgentConfig; onApply: (c: AgentConfig, name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showForm, setShowForm] = useState(false);
  const version = useLive((s) => s.versions.presets);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open);
  const { data, reload } = useAsync(() => api.presets(), [version]);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const ok = await attempt(() => api.createPreset(name.trim(), description.trim(), cfg), `Preset “${name.trim()}” saved`);
    setSaving(false);
    if (ok) { setName(''); setDescription(''); setShowForm(false); reload(); }
  };

  return (
    <div ref={ref} className="relative">
      <Button variant="secondary" size="lg" onClick={() => setOpen((o) => !o)} aria-expanded={open}><Layers className="size-4" />Presets<ChevronDown className="size-4" /></Button>
      {open && (
        <div className="slide-in absolute right-0 top-12 z-40 w-[340px] rounded-2xl border border-line bg-white shadow-pop">
          <div className="border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Configuration presets</p>
            <p className="text-xs text-muted">Applying a preset loads it into the draft. Nothing goes live until you deploy.</p>
          </div>
          <div className="max-h-72 overflow-auto p-1.5 scroll-thin">
            {data?.items.map((p) => (
              <div key={p.id} className="group flex items-start gap-2 rounded-xl px-3 py-2 hover:bg-brand-50">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">{p.name}{p.builtIn && <span className="rounded bg-brand-50 px-1.5 text-[10px] font-medium text-brand-700">Built-in</span>}</p>
                  <p className="text-[11px] text-muted">{p.description || `Saved by ${p.createdBy}`}</p>
                  <p className="text-[10.5px] text-ink-soft">temp {p.config.parameters.temperature} · {p.config.parameters.maxTokens} tokens · refund ≥ ₹{p.config.escalation.refundValueThreshold.toLocaleString('en-IN')}</p>
                </div>
                <button onClick={() => { onApply(p.config, p.name); setOpen(false); }} className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-white">Apply</button>
                {!p.builtIn && (
                  <button aria-label={`Delete preset ${p.name}`} onClick={() => attempt(() => api.deletePreset(p.id), 'Preset deleted').then(reload)} className="rounded-lg p-1 text-muted opacity-0 hover:bg-white hover:text-critical group-hover:opacity-100 focus:opacity-100"><Trash2 className="size-3.5" /></button>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-line p-3">
            {showForm ? (
              <div className="flex flex-col gap-2">
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Preset name, e.g. Holiday peak" maxLength={60} className="h-9 rounded-lg border border-line px-3 text-sm outline-none focus:border-brand-300" />
                <input value={description} onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="Short description (optional)" maxLength={200} className="h-9 rounded-lg border border-line px-3 text-sm outline-none focus:border-brand-300" />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button size="sm" onClick={save} loading={saving} disabled={!name.trim()}>Save preset</Button>
                </div>
              </div>
            ) : (
              <Button variant="soft" size="sm" className="w-full" onClick={() => setShowForm(true)}>Save current settings as preset</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const fmtValue = (v: unknown) => (typeof v === 'boolean' ? (v ? 'On' : 'Off') : typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString('en-IN') : v.toFixed(2)) : String(v));
const RISK_TONE: Record<string, Tone> = { Low: 'ok', Moderate: 'warn', High: 'critical' };

export function DeployModal({ open, onClose, detail, onDeployed, evalsRanOnDraft }: { open: boolean; onClose: () => void; detail: AgentDetail; onDeployed: () => void; evalsRanOnDraft: boolean }) {
  const [busy, setBusy] = useState<'deploy' | 'discard' | null>(null);
  const draft = detail.draft;
  const [major, minor = '0'] = detail.agent.version.split('.');
  const nextVersion = `${major}.${Number(minor) + 1}`;
  const weakest = [...detail.evals.suite].sort((a, b) => a.score - b.score)[0];

  const deploy = async () => {
    setBusy('deploy');
    const ok = await attempt(() => api.deploy(detail.agent.id), `${detail.agent.name} v${nextVersion} deployed to 100% traffic`);
    setBusy(null);
    if (ok) { onDeployed(); onClose(); }
  };
  const discard = async () => {
    setBusy('discard');
    const ok = await attempt(() => api.discardDraft(detail.agent.id), 'Draft discarded');
    setBusy(null);
    if (ok) { onDeployed(); onClose(); }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Review & deploy ${detail.agent.name}`} width="max-w-xl" footer={draft && (
      <>
        <Button variant="ghost" className="mr-auto text-critical-ink" onClick={discard} loading={busy === 'discard'}>Discard draft</Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={deploy} loading={busy === 'deploy'}>Deploy v{nextVersion}<ArrowRight className="size-4" /></Button>
      </>
    )}>
      {!draft ? <p className="text-sm text-muted">There are no draft changes to deploy.</p> : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">{draft.changeRequest}</span>
            <Badge tone={RISK_TONE[draft.risk.level]}>Risk: {draft.risk.level}</Badge>
            <span className="text-xs text-muted">v{detail.agent.version} → v{nextVersion}</span>
          </div>
          {draft.risk.reasons.length > 0 && (
            <ul className="list-disc rounded-xl bg-[#f8f6fb] py-2 pl-8 pr-3 text-xs text-ink-soft">
              {draft.risk.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#f8f6fb] text-[10.5px] uppercase tracking-wide text-ink-soft">
                <tr><th className="px-3 py-2 font-semibold">Setting</th><th className="px-3 py-2 font-semibold">Live</th><th className="px-3 py-2 font-semibold">Draft</th></tr>
              </thead>
              <tbody>
                {draft.changes.map((c: ConfigChange) => (
                  <tr key={c.path} className="border-t border-line">
                    <td className="px-3 py-2 text-ink">{c.label}</td>
                    <td className="px-3 py-2 tabular-nums text-muted line-through decoration-muted/50">{fmtValue(c.from)}</td>
                    <td className="px-3 py-2 font-semibold tabular-nums text-brand-800">{fmtValue(c.to)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={cx('rounded-xl px-3 py-2.5 text-xs', evalsRanOnDraft ? (weakest && weakest.score < 80 ? 'bg-critical-soft text-critical-ink' : 'bg-ok-soft text-ok-ink') : 'bg-warn-soft text-warn-ink')}>
            {evalsRanOnDraft
              ? weakest && weakest.score < 80
                ? `Evaluations on this draft flag a risk: ${weakest.label} scored ${weakest.score}%. Consider adjusting before deploying.`
                : 'Evaluations on this draft passed every guardrail.'
              : 'Evaluations have not been run on this draft yet. Use "Run evals" to check it against policy before deploying.'}
          </div>
        </div>
      )}
    </Modal>
  );
}
