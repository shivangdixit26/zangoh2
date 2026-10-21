import { z } from 'zod';
import { emit } from '../events.ts';
import { HttpError } from '../lib/http.ts';
import { uid } from '../lib/util.ts';
import { store } from '../store.ts';
import type { Template } from '../types.ts';

export const TEMPLATE_TYPES = ['Chat', 'Email', 'SMS'] as const;

export const templateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  title: z.string().trim().max(140).default(''),
  category: z.string().trim().min(1, 'Pick a category').max(30),
  type: z.enum(TEMPLATE_TYPES).default('Chat'),
  channels: z.array(z.string().trim().min(1).max(30)).min(1, 'Pick at least one channel').max(6),
  content: z.string().trim().min(1, 'Content is required').max(2000),
  cta: z.string().trim().max(40).nullable().default(null),
  shared: z.boolean().default(false),
});
export type TemplateInput = z.infer<typeof templateSchema>;

/** What a supervisor receives: favourites are resolved for them. */
export type TemplateView = Omit<Template, 'favoriteBy'> & { favorite: boolean; canEdit: boolean };

const VARIABLE = /\{\{\s*([^{}]*?)\s*\}\}/g;
const VALID_NAME = /^[a-z][a-z0-9_]*$/;

/** Variables use {{snake_case}} placeholders. Reject malformed or unbalanced braces early so they never reach a customer. */
export function validateContent(content: string): string[] {
  const problems: string[] = [];
  const names = [...content.matchAll(VARIABLE)].map((m) => m[1]);
  for (const n of names) if (!VALID_NAME.test(n)) problems.push(`"{{${n}}}" is not a valid variable name (use lower_snake_case)`);
  const stripped = content.replace(VARIABLE, '');
  if (stripped.includes('{{') || stripped.includes('}}')) problems.push('Unbalanced {{ }} braces');
  return problems;
}

export const extractVariables = (content: string) => [...new Set([...content.matchAll(VARIABLE)].map((m) => m[1]).filter((n) => VALID_NAME.test(n)))];

/** Private templates are visible only to their author; shared ones to the whole team. */
export const canSee = (t: Template, supervisor: string) => t.shared || t.createdBy === supervisor;
export const canEdit = (t: Template, supervisor: string) => t.createdBy === supervisor;

export function view(t: Template, supervisor: string): TemplateView {
  const { favoriteBy, ...rest } = t;
  return { ...rest, favorite: favoriteBy.includes(supervisor), canEdit: canEdit(t, supervisor) };
}

function assertValid(input: TemplateInput) {
  const problems = [...validateContent(input.content), ...validateContent(input.title)];
  if (problems.length) throw new HttpError(400, 'Invalid template content', problems.map((message) => ({ path: 'content', message })));
}

export function listTemplates(supervisor: string, q?: string): TemplateView[] {
  const needle = q?.trim().toLowerCase();
  return store.state.templates
    .filter((t) => canSee(t, supervisor))
    .filter((t) => !needle || [t.name, t.title, t.content, t.category, t.type, ...t.channels].some((s) => s.toLowerCase().includes(needle)))
    .sort((a, b) => b.uses - a.uses)
    .map((t) => view(t, supervisor));
}

function find(id: string, supervisor: string): Template {
  const t = store.state.templates.find((x) => x.id === id);
  if (!t || !canSee(t, supervisor)) throw new HttpError(404, 'Template not found');
  return t;
}

function findEditable(id: string, supervisor: string): Template {
  const t = find(id, supervisor);
  if (!canEdit(t, supervisor)) throw new HttpError(403, `Only ${t.createdBy} can change this template`);
  return t;
}

export const getTemplate = (id: string, supervisor: string) => view(find(id, supervisor), supervisor);

export function createTemplate(input: TemplateInput, supervisor: string): TemplateView {
  assertValid(input);
  const now = Date.now();
  const t: Template = { id: uid('tpl'), ...input, favoriteBy: [], uses: 0, lastUsedAt: null, createdBy: supervisor, createdAt: now, updatedAt: now };
  store.state.templates.push(t);
  store.save();
  emit.templates();
  return view(t, supervisor);
}

export function updateTemplate(id: string, input: TemplateInput, supervisor: string): TemplateView {
  assertValid(input);
  const t = findEditable(id, supervisor);
  Object.assign(t, input, { updatedAt: Date.now() });
  store.save();
  emit.templates();
  return view(t, supervisor);
}

export function deleteTemplate(id: string, supervisor: string): void {
  findEditable(id, supervisor);
  store.state.templates = store.state.templates.filter((t) => t.id !== id);
  store.save();
  emit.templates();
}

export function setFavorite(id: string, favorite: boolean, supervisor: string): TemplateView {
  const t = find(id, supervisor);
  t.favoriteBy = favorite ? [...new Set([...t.favoriteBy, supervisor])] : t.favoriteBy.filter((s) => s !== supervisor);
  store.save();
  emit.templates();
  return view(t, supervisor);
}

/** Record that a template was used; also checks the sender is allowed to see it. */
export function recordUse(id: string, supervisor: string): Template | undefined {
  const t = store.state.templates.find((x) => x.id === id && canSee(x, supervisor));
  if (!t) return undefined;
  t.uses += 1;
  t.lastUsedAt = Date.now();
  emit.templates();
  return t;
}
