import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TemplateEditorModal } from '../components/templates/TemplateEditorModal';
import { TemplateLibrary } from '../components/templates/TemplateLibrary';
import { TemplatePreview } from '../components/templates/TemplatePreview';
import { Avatar, Button, ConfirmModal, Empty, Modal, PriorityBadge, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAsync } from '../lib/hooks';
import { PERSONAS, type VarValues } from '../lib/templateVars';
import { attempt, useLive } from '../store/live';
import type { Template } from '../types';

/** Template Management screen ("Template Governance Workspace"). */
export default function Templates() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const version = useLive((s) => s.versions.templates);
  const supervisor = useLive((s) => s.supervisor);
  const conversationsMap = useLive((s) => s.conversations);
  const { data, reload } = useAsync(() => api.templates(), [version]);
  const templates = data?.items ?? [];

  const [selected, setSelected] = useState<string | null>(params.get('focus'));
  const [personaId, setPersonaId] = useState(PERSONAS[0].id);
  const [overrides, setOverrides] = useState<VarValues>({});
  const [editing, setEditing] = useState<Template | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [usePicker, setUsePicker] = useState<Template | null>(null);

  useEffect(() => {
    const focus = params.get('focus');
    if (focus) setSelected(focus);
  }, [params]);
  useEffect(() => {
    if (!selected && templates.length) setSelected(templates[0].id);
  }, [selected, templates]);

  const template = templates.find((t) => t.id === selected) ?? null;
  const openConversations = useMemo(() => Object.values(conversationsMap)
    .filter((c) => c.status !== 'resolved')
    .sort((a, b) => Number(b.supervisor === supervisor) - Number(a.supervisor === supervisor) || b.risk - a.risk), [conversationsMap, supervisor]);

  const select = (t: Template) => {
    setSelected(t.id);
    setOverrides({});
    if (params.get('focus')) setParams({}, { replace: true });
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    const ok = await attempt(() => api.deleteTemplate(deleting.id), `Deleted "${deleting.name}"`);
    setDeleteBusy(false);
    if (ok) {
      if (selected === deleting.id) setSelected(null);
      setDeleting(null);
      reload();
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">Template Governance Workspace</h1>
          <p className="mt-1 text-[13px] text-muted">Manage content quality, approvals, localization, performance, and lifecycle</p>
        </div>
        <Button size="lg" className="px-10" onClick={() => { setEditing(null); setEditorOpen(true); }}><Plus className="size-4" />Create template</Button>
      </div>

      <div className="card grid min-h-[640px] grid-cols-1 overflow-hidden lg:h-[calc(100vh-190px)] lg:grid-cols-[minmax(0,1fr)_320px]">
        {data ? (
          <TemplateLibrary
            templates={templates}
            selectedId={selected}
            onSelect={select}
            actions
            onEdit={(t) => { setEditing(t); setEditorOpen(true); }}
            onDelete={(t) => setDeleting(t)}
            onUse={(t) => setUsePicker(t)}
          />
        ) : <div className="flex items-center justify-center"><Spinner /></div>}
        <div className="flex min-h-0 flex-col border-t border-line lg:border-l lg:border-t-0">
          <TemplatePreview
            template={template}
            personas={PERSONAS}
            personaId={personaId}
            onPersona={(id) => { setPersonaId(id); setOverrides({}); }}
            overrides={overrides}
            onOverride={(k, v) => setOverrides((o) => ({ ...o, [k]: v }))}
            onResetOverride={(k) => setOverrides(({ [k]: _drop, ...rest }) => rest)}
            onCancel={() => { setSelected(null); setOverrides({}); }}
            onInsert={() => template && setUsePicker(template)}
            note="Insert opens a live conversation with this template ready to send."
          />
        </div>
      </div>

      <TemplateEditorModal open={editorOpen} template={editing} categories={[...new Set(templates.map((t) => t.category))]} onClose={() => setEditorOpen(false)} onSaved={(t) => { setSelected(t.id); reload(); }} />

      <ConfirmModal
        open={Boolean(deleting)}
        title="Delete template?"
        body={<>“{deleting?.name}” will be removed for everyone. It has been used {deleting?.uses ?? 0} times.</>}
        confirmLabel="Delete"
        danger
        loading={deleteBusy}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />

      <Modal open={Boolean(usePicker)} onClose={() => setUsePicker(null)} title={`Use “${usePicker?.name ?? ''}” in a conversation`} width="max-w-md">
        <p className="mb-3 text-xs text-muted">Pick a live conversation. You'll review the variables against that customer before anything is sent.</p>
        <div className="flex max-h-80 flex-col gap-1 overflow-auto scroll-thin">
          {!openConversations.length && <Empty title="No open conversations" />}
          {openConversations.map((c) => (
            <button key={c.id} onClick={() => navigate(`/conversations/${c.id}?template=${usePicker?.id}`)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-brand-50">
              <Avatar name={c.customer.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{c.customer.name} · #{c.caseNumber}</span>
                <span className="block truncate text-xs text-muted">{c.topic} · {c.control === 'supervisor' ? `handled by ${c.supervisor === supervisor ? 'you' : c.supervisor}` : 'AI agent'}</span>
              </span>
              <PriorityBadge priority={c.priority} className="px-2 py-0" />
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
