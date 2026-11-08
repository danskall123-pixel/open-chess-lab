import type { z } from 'zod';
import { badRequest } from './errors.js';

export function parseBody<Schema extends z.ZodType>(
  schema: Schema,
  body: unknown,
): z.infer<Schema> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw badRequest(first ? first.message : 'Invalid request.');
  }
  return parsed.data;
}
