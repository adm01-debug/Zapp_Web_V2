/**
 * contract-kit — porta única `parseOrReject` (item 041 do inventário).
 *
 * Prova o que o cartão pede:
 *  1. envelope 422 ÚNICO: a falha do `parseOrReject` é byte a byte o mesmo corpo
 *     que o caminho legado (`parseBody` + `validationErrorResponse`) devolve.
 *  2. versionamento: `x-contract-version: 2` seleciona o schema v2 e a resposta
 *     (sucesso e 422) ecoa a versão aplicada; sem header = v1.
 *  3. fail-closed: body ausente, schema de versão não registrado ou schema que
 *     não é Zod viram 422 com o envelope canônico — nunca lançam (500).
 */
import { describe, it, expect } from 'vitest';
import {
  z,
  parseBody,
  validationErrorResponse,
  AiEnhanceMessageSchema,
  EvolutionWebhookEnvelopeV1Schema,
  EvolutionWebhookEnvelopeV2Schema,
} from '../../supabase/functions/_shared/schemas.ts';
import { parseOrReject, contractHeaders } from '../../supabase/functions/_shared/contract-kit.ts';

const req = (headers: Record<string, string> = {}) =>
  new Request('https://x.test/edge', { method: 'POST', headers });

async function bodyOf(res: Response) {
  return JSON.parse(await res.text());
}

const versioned = { v1: EvolutionWebhookEnvelopeV1Schema, v2: EvolutionWebhookEnvelopeV2Schema };

describe('contract-kit.parseOrReject — envelope 422 único', () => {
  it('payload válido passa e devolve versão + headers de contrato', () => {
    const r = parseOrReject(req(), { message: 'oi' }, AiEnhanceMessageSchema);
    expect(r.ok).toBe(true);
    if (r.ok === false) return;
    expect(r.version).toBe(1);
    expect(r.data.message).toBe('oi');
    expect(r.headers['x-contract-version']).toBe('1');
  });

  it('payload inválido responde 422 no MESMO corpo do caminho legado', async () => {
    const legacy = parseBody(AiEnhanceMessageSchema, {});
    if (legacy.success) throw new Error('esperava falha do schema legado');
    const legacyBody = await bodyOf(validationErrorResponse(legacy, req()));

    const r = parseOrReject(req(), {}, AiEnhanceMessageSchema);
    expect(r.ok).toBe(false);
    if (r.ok === true) return;
    expect(r.response.status).toBe(422);
    expect(r.response.headers.get('content-type')).toContain('application/json');
    expect(r.response.headers.get('x-contract-version')).toBe('1');

    const body = await bodyOf(r.response);
    expect(body).toEqual(legacyBody);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.fields.map((f: { path: string }) => f.path)).toContain('message');
  });
});

describe('contract-kit.parseOrReject — versionamento v1/v2', () => {
  const legacyPayload = { event: 'application.startup', instance: 'wpp-promo' };

  it('o mesmo payload passa em v1 e é recusado em v2 com 422 marcado como v2', async () => {
    const ok = parseOrReject(req(), legacyPayload, versioned);
    expect(ok.ok).toBe(true);
    if (ok.ok === true) expect(ok.version).toBe(1);

    const bad = parseOrReject(req({ 'x-contract-version': '2' }), legacyPayload, versioned);
    expect(bad.ok).toBe(false);
    if (bad.ok === true) return;
    expect(bad.response.status).toBe(422);
    expect(bad.response.headers.get('x-contract-version')).toBe('2');
    const body = await bodyOf(bad.response);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.fields.map((f: { path: string }) => f.path)).toContain('data');
  });

  it('header inválido cai em v1 (retrocompatível)', () => {
    const r = parseOrReject(req({ 'x-contract-version': 'banana' }), legacyPayload, versioned);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.version).toBe(1);
  });

  it('contractHeaders ecoa a versão aplicada', () => {
    expect(contractHeaders(2)).toEqual({ 'x-contract-version': '2' });
  });
});

describe('contract-kit.parseOrReject — fail-closed (nunca 500)', () => {
  it('body ausente (null) vira 422, não exceção', async () => {
    const r = parseOrReject(req(), null, AiEnhanceMessageSchema);
    expect(r.ok).toBe(false);
    if (r.ok === true) return;
    expect(r.response.status).toBe(422);
    const body = await bodyOf(r.response);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.fields[0].path).toBe('(root)');
  });

  it('versão pedida sem schema registrado vira 422 com envelope canônico', async () => {
    const incompleto = { v1: EvolutionWebhookEnvelopeV1Schema } as unknown as typeof versioned;
    const r = parseOrReject(req({ 'x-contract-version': '2' }), { event: 'e', instance: 'i' }, incompleto);
    expect(r.ok).toBe(false);
    if (r.ok === true) return;
    expect(r.response.status).toBe(422);
    const body = await bodyOf(r.response);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('schema que não é Zod vira 422, não TypeError', async () => {
    const quebrado = { v1: {} } as unknown as typeof versioned;
    const r = parseOrReject(req(), { event: 'e', instance: 'i' }, quebrado);
    expect(r.ok).toBe(false);
    if (r.ok === true) return;
    expect(r.response.status).toBe(422);
    const body = await bodyOf(r.response);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('z.custom que lança vira 422 com o motivo em fields', async () => {
    const explosivo = z.object({ a: z.custom(() => { throw new Error('boom'); }) });
    const r = parseOrReject(req(), { a: 1 }, explosivo);
    expect(r.ok).toBe(false);
    if (r.ok === true) return;
    expect(r.response.status).toBe(422);
    const body = await bodyOf(r.response);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(body.error.fields)).toContain('boom');
  });
});
