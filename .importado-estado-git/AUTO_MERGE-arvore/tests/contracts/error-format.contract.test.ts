import { describe, it, expect } from 'vitest';
import {
  z, parseBody, validationErrorResponse, toFieldErrors,
  AiEnhanceMessageSchema,
} from '../../supabase/functions/_shared/schemas.ts';

async function bodyOf(res: Response) { return JSON.parse(await res.text()); }

describe('formato único de erro de validação (422)', () => {
  it('retorna 422 com { error: { code, message, fields[] } }', async () => {
    const parsed = parseBody(AiEnhanceMessageSchema, {});
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const res = validationErrorResponse(parsed);
    expect(res.status).toBe(422);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('x-contract-version')).toBe('1');
    const body = await bodyOf(res);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(typeof body.error.message).toBe('string');
    expect(Array.isArray(body.error.fields)).toBe(true);
    expect(body.error.fields.length).toBeGreaterThan(0);
    for (const f of body.error.fields) {
      expect(typeof f.path).toBe('string');
      expect(typeof f.message).toBe('string');
      expect(typeof f.code).toBe('string');
    }
    expect(body.error.fields.map((f: { path: string }) => f.path)).toContain('message');
  });

  it('aceita ZodError direto', async () => {
    const r = z.object({ a: z.string() }).safeParse({ a: 1 });
    if (r.success) throw new Error('esperava falha');
    const res = validationErrorResponse(r.error);
    expect(res.status).toBe(422);
    const body = await bodyOf(res);
    expect(body.error.fields[0].path).toBe('a');
  });

  it('aceita FieldError[] direto e marca a versão do contrato', async () => {
    const res = validationErrorResponse(
      [{ path: '(root)', message: 'Body must be a valid JSON object', code: 'invalid_type' }],
      undefined, 2,
    );
    expect(res.status).toBe(422);
    expect(res.headers.get('x-contract-version')).toBe('2');
    const body = await bodyOf(res);
    expect(body.error.fields[0].path).toBe('(root)');
  });

  it('parseBody é retrocompatível (.error string) e aditivo (.issues)', () => {
    const parsed = parseBody(AiEnhanceMessageSchema, { message: '' });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(typeof parsed.error).toBe('string');
    expect(parsed.error.length).toBeGreaterThan(0);
    expect(parsed.issues[0]).toHaveProperty('path');
    expect(parsed.issues[0]).toHaveProperty('code');
  });

  it('toFieldErrors normaliza path vazio para (root)', () => {
    const r = z.string().safeParse(5);
    if (r.success) throw new Error('esperava falha');
    expect(toFieldErrors(r.error)[0].path).toBe('(root)');
  });
});
