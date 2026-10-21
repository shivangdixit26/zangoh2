import { AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import { cx } from '../../lib/format';
import { extractVariables, humanList, resolveTemplate, varLabel, VARIABLE_MAP, type VarValues } from '../../lib/templateVars';
import type { Template } from '../../types';
import { Button, PillSelect } from '../ui';
import { RichText } from './RichText';

export interface PreviewPersona { id: string; label: string; values: VarValues }

/** Values used for the preview and on insert: the supervisor's edits win over automatic values (an emptied field counts as missing). */
export function mergeValues(auto: VarValues, overrides: VarValues): VarValues {
  return { ...auto, ...overrides };
}

/**
 * Right-hand preview used by the Templates screen and the in-chat picker.
 * Lists every variable in the template with an editable value (auto-filled from the customer when known),
 * then shows the completed message exactly as the customer will receive it.
 */
export function TemplatePreview({ template, personas, personaId, onPersona, overrides, onOverride, onResetOverride, onCancel, onInsert, insertLabel = 'Insert', note = 'You can edit the message after inserting.' }: {
  template: Template | null;
  personas: PreviewPersona[];
  personaId: string;
  onPersona: (id: string) => void;
  overrides: VarValues;
  onOverride: (key: string, value: string) => void;
  onResetOverride: (key: string) => void;
  onCancel: () => void;
  onInsert: () => void;
  insertLabel?: string;
  note?: string;
}) {
  const persona = personas.find((p) => p.id === personaId) ?? personas[0];
  const values = mergeValues(persona.values, overrides);
  const res = template ? resolveTemplate(template.content, values) : null;
  const vars = template ? extractVariables(template.content) : [];
  const source = persona.id === 'conversation' ? 'the conversation' : persona.label.toLowerCase();
  const edited = vars.filter((k) => k in overrides && overrides[k]?.trim() && overrides[k] !== persona.values[k]);
  const auto = res ? res.resolved.filter((k) => !edited.includes(k)) : [];

  return (
    <div className="flex min-h-0 flex-col px-5 py-5">
      <h2 className="text-lg font-semibold text-ink">Preview</h2>
      <p className="mt-0.5 text-xs text-muted">Fill in the variables and review the completed message.</p>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink">Preview as</p>
      <PillSelect
        variant="field"
        className="mt-2 [&>button]:h-11"
        value={persona.id}
        onChange={onPersona}
        options={personas.map((p) => ({ value: p.id, label: p.label }))}
      />

      <div className="mt-4 min-h-0 flex-1 overflow-auto pr-0.5 scroll-thin">
        {template && vars.length > 0 && (
          <fieldset className="mb-4">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink">Variables</legend>
            <div className="flex flex-col gap-2">
              {vars.map((k) => {
                const value = values[k] ?? '';
                const isEdited = edited.includes(k);
                const missing = !value.trim();
                return (
                  <label key={k} className="block">
                    <span className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-ink-soft">{varLabel(k)} <code className="text-[10px] text-muted">{`{{${k}}}`}</code></span>
                      {missing ? <span className="font-semibold text-warn-ink">Required</span>
                        : isEdited && persona.values[k] ? (
                          <button type="button" onClick={() => onResetOverride(k)} className="inline-flex items-center gap-0.5 font-semibold text-info-ink hover:underline" title="Use the automatic value again">
                            <RotateCcw className="size-3" />Edited
                          </button>
                        ) : isEdited ? <span className="font-semibold text-info-ink">Entered by you</span>
                          : <span className="font-semibold text-ok-ink">Auto · from {source}</span>}
                    </span>
                    <input
                      value={value}
                      onChange={(e) => onOverride(k, e.target.value)}
                      placeholder={VARIABLE_MAP[k]?.sample ? `e.g. ${VARIABLE_MAP[k].sample}` : 'Type a value'}
                      aria-label={varLabel(k)}
                      className={cx(
                        'h-9 w-full rounded-lg border bg-white px-2.5 text-[13px] outline-none focus:border-brand-400',
                        missing ? 'border-warn bg-warn-soft/40' : isEdited ? 'border-info/50' : 'border-ok/40',
                      )}
                    />
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="rounded-2xl border border-line bg-[#f6f5f9] p-3">
          <p className="text-[11px] text-muted">Live preview · completed message</p>
          {template ? (
            <div className="mt-2 flex items-start gap-2.5">
              <span className="mt-1 size-6 shrink-0 rounded-full bg-brand-200" />
              <div className="min-w-0 flex-1">
                <div className="rounded-xl bg-white px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-soft shadow-card">
                  <RichText text={template.content} values={values} />
                </div>
                {template.cta && (
                  <div className="mt-3 flex justify-center"><span className="rounded-xl bg-brand-800 px-6 py-2 text-xs font-semibold text-white">{template.cta}</span></div>
                )}
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-xs text-muted">Select a template to preview it.</p>
          )}
        </div>
      </div>

      {template && res && (
        res.missing.length === 0 ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-ok-soft px-3 py-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
            <div>
              <p className="text-[13px] font-semibold text-ok-ink">{res.resolved.length ? `${res.resolved.length} variable${res.resolved.length === 1 ? '' : 's'} resolved` : 'No variables in this template'}</p>
              {res.resolved.length > 0 && (
                <p className="text-[11px] text-ok-ink/80">
                  {auto.length > 0 && `${humanList(auto)} from ${source}`}
                  {auto.length > 0 && edited.length > 0 && '; '}
                  {edited.length > 0 && `${humanList(edited)} entered by you`}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
            <div>
              <p className="text-[13px] font-semibold text-warn-ink">{res.missing.length} variable{res.missing.length === 1 ? '' : 's'} need{res.missing.length === 1 ? 's' : ''} a value</p>
              <p className="text-[11px] text-warn-ink/80">{humanList(res.missing)}. {res.resolved.length} resolved.</p>
            </div>
          </div>
        )
      )}

      <hr className="my-3 border-line" />
      <p className="text-xs text-muted">{note}</p>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} className="w-24">Cancel</Button>
        <Button onClick={onInsert} disabled={!template} className="w-24">{insertLabel}</Button>
      </div>
    </div>
  );
}
