import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { conversationValues, PERSONAS, resolveTemplate, toPlainText, type VarValues } from '../../lib/templateVars';
import { useLive } from '../../store/live';
import type { ConversationSummary, Template } from '../../types';
import { IconButton, Modal, Spinner } from '../ui';
import { TemplateLibrary } from './TemplateLibrary';
import { mergeValues, TemplatePreview, type PreviewPersona } from './TemplatePreview';

export interface InsertedTemplate {
  text: string;
  template: Template;
  resolved: string[];
  missing: string[];
}

/** "Template usage interface": pick a reply, preview it against this customer, fill gaps, insert into the composer. */
export function TemplatePickerModal({ open, onClose, conversation, initialTemplateId, onInsert }: {
  open: boolean;
  onClose: () => void;
  conversation: ConversationSummary | null;
  initialTemplateId?: string | null;
  onInsert: (r: InsertedTemplate) => void;
}) {
  const supervisor = useLive((s) => s.supervisor);
  const version = useLive((s) => s.versions.templates);
  const { data } = useAsync(() => api.templates(), [version]);
  const templates = data?.items ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const [personaId, setPersonaId] = useState('conversation');
  const [overrides, setOverrides] = useState<VarValues>({});

  const personas: PreviewPersona[] = useMemo(() => [
    ...(conversation ? [{ id: 'conversation', label: `${conversation.customer.name} (this chat)`, values: conversationValues(conversation, supervisor) }] : []),
    ...PERSONAS,
  ], [conversation, supervisor]);

  useEffect(() => {
    if (!open) return;
    setPersonaId(conversation ? 'conversation' : PERSONAS[0].id);
    setOverrides({});
    setSelected(initialTemplateId ?? null);
    // Keyed on the conversation id: the summary object is replaced on every live update.
  }, [open, conversation?.id, initialTemplateId]);

  useEffect(() => {
    if (open && !selected && templates.length) setSelected(templates[0].id);
  }, [open, selected, templates]);

  const template = templates.find((t) => t.id === selected) ?? null;

  const insert = () => {
    if (!template) return;
    const persona = personas.find((p) => p.id === personaId) ?? personas[0];
    const r = resolveTemplate(template.content, mergeValues(persona.values, overrides));
    onInsert({ text: toPlainText(r.text), template, resolved: r.resolved, missing: r.missing });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} bare width="max-w-[1180px]">
      <div className="relative grid h-[min(720px,92vh)] grid-cols-1 overflow-auto lg:grid-cols-[minmax(0,1fr)_330px] lg:overflow-hidden">
        <IconButton label="Close templates" onClick={onClose} className="absolute right-3 top-3 z-10 text-muted hover:bg-brand-50"><X className="size-4" /></IconButton>
        {data ? (
          <div className="flex min-h-[420px] lg:min-h-0">
            <TemplateLibrary compact templates={templates} selectedId={selected} onSelect={(t) => { setSelected(t.id); setOverrides({}); }} />
          </div>
        ) : <div className="flex items-center justify-center"><Spinner /></div>}
        <div className="flex min-h-0 flex-col border-t border-line lg:border-l lg:border-t-0">
          <TemplatePreview
            template={template}
            personas={personas}
            personaId={personaId}
            onPersona={(id) => { setPersonaId(id); setOverrides({}); }}
            overrides={overrides}
            onOverride={(k, v) => setOverrides((o) => ({ ...o, [k]: v }))}
            onResetOverride={(k) => setOverrides(({ [k]: _drop, ...rest }) => rest)}
            onCancel={onClose}
            onInsert={insert}
            insertLabel="Use"
            note="Inserts the completed message into your reply box. Review it, then send."
          />
        </div>
      </div>
    </Modal>
  );
}
