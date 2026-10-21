import { Router } from 'express';
import { z } from 'zod';
import { parse, supervisorOf } from '../lib/http.ts';
import { createTemplate, deleteTemplate, getTemplate, listTemplates, setFavorite, templateSchema, updateTemplate } from '../services/templates.ts';

export const templatesRouter = Router();

templatesRouter.get('/', (req, res) => {
  const items = listTemplates(supervisorOf(req), typeof req.query.q === 'string' ? req.query.q : undefined);
  res.json({ items, total: items.length });
});

templatesRouter.get('/:id', (req, res) => res.json(getTemplate(req.params.id, supervisorOf(req))));

templatesRouter.post('/', (req, res) => {
  res.status(201).json(createTemplate(parse(templateSchema, req.body ?? {}), supervisorOf(req)));
});

templatesRouter.put('/:id', (req, res) => {
  res.json(updateTemplate(req.params.id, parse(templateSchema, req.body ?? {}), supervisorOf(req)));
});

templatesRouter.delete('/:id', (req, res) => {
  deleteTemplate(req.params.id, supervisorOf(req));
  res.json({ ok: true });
});

templatesRouter.post('/:id/favorite', (req, res) => {
  const body = parse(z.object({ favorite: z.boolean() }), req.body ?? {});
  res.json(setFavorite(req.params.id, body.favorite, supervisorOf(req)));
});
