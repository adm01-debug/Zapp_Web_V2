import { describe, it, expect } from 'vitest';
import {
  EvolutionWebhookEnvelopeV1Schema, EvolutionWebhookEnvelopeV2Schema,
  ElevenLabsWebhookV1Schema, ElevenLabsWebhookV2Schema,
} from '../../supabase/functions/_shared/schemas.ts';
import { getContractVersion, parseVersioned, deprecationHeaders } from '../../supabase/functions/_shared/contracts.ts';

const req = (headers: Record<string, string> = {}) =>
  new Request('https://x.test/webhook', { method: 'POST', headers });

describe('negociação de versão', () => {
  it('sem header → v1; "2" → v2; valor inválido → v1', () => {
    expect(getContractVersion(req())).toBe(1);
    expect(getContractVersion(req({ 'x-contract-version': '2' }))).toBe(2);
    expect(getContractVersion(req({ 'x-contract-version': '1' }))).toBe(1);
    expect(getContractVersion(req({ 'x-contract-version': 'banana' }))).toBe(1);
  });

  it('V1 sem sunset definido não emite headers de depreciação', () => {
    expect(deprecationHeaders(1)).toEqual({});
    expect(deprecationHeaders(2)).toEqual({});
  });
});

describe('evolution-webhook: retrocompatibilidade v1 enquanto v2 endurece', () => {
  const schemas = { v1: EvolutionWebhookEnvelopeV1Schema, v2: EvolutionWebhookEnvelopeV2Schema };
  const legacyPayload = { event: 'application.startup', instance: 'wpp-promo' }; // GO manda sem data em alguns eventos

  it('payload legado (sem data) passa em v1', () => {
    const r = parseVersioned(req(), legacyPayload, schemas);
    expect(r.ok).toBe(true);
  });

  it('o MESMO payload legado é rejeitado em v2 com 422 estruturado', async () => {
    const r = parseVersioned(req({ 'x-contract-version': '2' }), legacyPayload, schemas);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.version).toBe(2);
    expect(r.response.status).toBe(422);
    expect(r.response.headers.get('x-contract-version')).toBe('2');
    const body = JSON.parse(await r.response.text());
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.fields.map((f: { path: string }) => f.path)).toContain('data');
  });

  it('payload completo passa nas duas versões (compat durante transição)', () => {
    const full = { event: 'messages.upsert', instance: 'wpp-promo', data: { key: { id: 'ABC' } }, sender: 'x', apikey: 'k' };
    expect(parseVersioned(req(), full, schemas).ok).toBe(true);
    expect(parseVersioned(req({ 'x-contract-version': '2' }), full, schemas).ok).toBe(true);
  });

  it('campos extras não quebram nenhuma versão (passthrough)', () => {
    const extra = { event: 'e', instance: 'i', data: {}, novo_campo_da_evolution: true };
    expect(parseVersioned(req(), extra, schemas).ok).toBe(true);
    expect(parseVersioned(req({ 'x-contract-version': '2' }), extra, schemas).ok).toBe(true);
  });

  it('envelope sem event/instance falha nas DUAS versões (contrato mínimo)', () => {
    expect(parseVersioned(req(), {}, schemas).ok).toBe(false);
    expect(parseVersioned(req({ 'x-contract-version': '2' }), {}, schemas).ok).toBe(false);
  });
});

describe('elevenlabs-webhook: v1 leniente, v2 exige identificação do evento', () => {
  const schemas = { v1: ElevenLabsWebhookV1Schema, v2: ElevenLabsWebhookV2Schema };

  it('objeto vazio passa em v1 (comportamento atual preservado) e falha em v2', () => {
    expect(parseVersioned(req(), {}, schemas).ok).toBe(true);
    const r = parseVersioned(req({ 'x-contract-version': '2' }), {}, schemas);
    expect(r.ok).toBe(false);
  });

  it('type OU event_type satisfazem v2', () => {
    expect(parseVersioned(req({ 'x-contract-version': '2' }), { type: 'tts.completed' }, schemas).ok).toBe(true);
    expect(parseVersioned(req({ 'x-contract-version': '2' }), { event_type: 'sfx.completed' }, schemas).ok).toBe(true);
  });

  it('type com tipo errado falha nas duas versões', () => {
    expect(parseVersioned(req(), { type: 123 }, schemas).ok).toBe(false);
    expect(parseVersioned(req({ 'x-contract-version': '2' }), { type: 123 }, schemas).ok).toBe(false);
  });
});
