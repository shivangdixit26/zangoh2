import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type z, type ZodTypeAny } from 'zod';
import { config } from '../config.ts';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const asyncHandler = (fn: (req: Request, res: Response) => Promise<unknown> | unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, 'Validation failed', result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return result.data;
}

/** The workstation has no login; the acting supervisor identifies themselves with a header (set in Settings). */
export function supervisorOf(req: Request): string {
  const raw = String(req.header('x-supervisor') ?? '').trim();
  const name = raw.replace(/[^\p{L}\p{N} .'-]/gu, '').slice(0, 60);
  return name || config.defaultSupervisor;
}

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.issues });
  }
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  console.error('[api] unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
}
