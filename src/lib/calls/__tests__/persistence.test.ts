/**
 * T11 — contrato do módulo de persistência da chamada.
 *
 * O que este arquivo trava:
 *  - os **nomes exatos** dos parâmetros `p_*` da RPC `upsert_my_call` (o
 *    contrato vive na migration B.3; um rename silencioso quebra aqui);
 *  - `p_status` **sempre explícito** (o INSERT do banco faz
 *    `coalesce(p_status,'ringing')`, então omitir sobrescreveria o fim);
 *  - retry idempotente: 3 tentativas com o **mesmo** `p_id` e devolução
 *    honesta do erro (`ok: false`) quando todas falham.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mockRpc } }));

import { UPSERT_MY_CALL_RPC, desfechoDaChamada, novoCallId, upsertMyCall, uuidV4 } from '../persistence';

/** Argumentos da n-ésima chamada a `upsert_my_call` (0 = primeira). */
function argsDe(n: number): Record<string, unknown> {
  return mockRpc.mock.calls[n][1] as Record<string, unknown>;
}

function idsChamados(): unknown[] {
  return mockRpc.mock.calls.map(([, args]) => (args as { p_id: unknown }).p_id);
}

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: 'c0ffee00-0000-0000-0000-000000000000', error: null });
});

describe('upsertMyCall — mapa p_* da RPC', () => {
  it('grava a chamada tocando com os nomes exatos dos parâmetros', async () => {
    const resultado = await upsertMyCall({
      id: '11111111-1111-1111-1111-111111111111',
      direction: 'outbound',
      status: 'ringing',
      channel: 'voip',
      peerNumber: '5511999999999',
      contactId: '22222222-2222-2222-2222-222222222222',
      providerCallId: 'sip-call-1',
    });

    expect(resultado).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc.mock.calls[0][0]).toBe('upsert_my_call');
    expect(mockRpc.mock.calls[0][0]).toBe(UPSERT_MY_CALL_RPC);
    expect(argsDe(0)).toEqual({
      p_id: '11111111-1111-1111-1111-111111111111',
      p_direction: 'outbound',
      p_status: 'ringing',
      p_channel: 'voip',
      p_peer_number: '5511999999999',
      p_contact_id: '22222222-2222-2222-2222-222222222222',
      p_provider_call_id: 'sip-call-1',
    });
  });

  it('grava o fim com status/motivo/duração e OMITE o que não tem valor', async () => {
    await upsertMyCall({
      id: 'id-fim',
      direction: 'inbound',
      status: 'missed',
      endedAt: '2026-09-30T12:00:00.000Z',
      endReason: 'no_answer',
      talkSeconds: null,
    });

    expect(argsDe(0)).toEqual({
      p_id: 'id-fim',
      p_direction: 'inbound',
      p_status: 'missed',
      p_ended_at: '2026-09-30T12:00:00.000Z',
      p_end_reason: 'no_answer',
    });
    // `undefined`/`null` não viram chave: o JSON do supabase-js descarta, e o
    // `coalesce` do banco mantém o que já estava gravado.
    const json = JSON.stringify(argsDe(0));
    for (const ausente of ['p_channel', 'p_peer_number', 'p_peer_name', 'p_contact_id', 'p_provider_call_id', 'p_answered_at', 'p_talk_seconds']) {
      expect(json).not.toContain(ausente);
    }
  });
});

describe('upsertMyCall — retry idempotente', () => {
  it('repete até 3× com o MESMO p_id e devolve ok no primeiro sucesso', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
      .mockResolvedValueOnce({ data: 'ok', error: null });

    const resultado = await upsertMyCall({
      id: 'id-retry',
      direction: 'outbound',
      status: 'answered',
      answeredAt: '2026-09-30T12:00:00.000Z',
    });

    expect(resultado).toEqual({ ok: true });
    expect(mockRpc).toHaveBeenCalledTimes(3);
    expect(idsChamados()).toEqual(['id-retry', 'id-retry', 'id-retry']);
  });

  it('devolve ok:false com o último erro depois de 3 falhas', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'sem rede' } });

    const resultado = await upsertMyCall({ id: 'id-falha', direction: 'outbound', status: 'ended' });

    expect(resultado.ok).toBe(false);
    expect(resultado.error).toEqual({ message: 'sem rede' });
    expect(mockRpc).toHaveBeenCalledTimes(3);
    expect(idsChamados()).toEqual(['id-falha', 'id-falha', 'id-falha']);
  });

  it('exceção da RPC também conta como falha (e nunca vaza para quem chamou)', async () => {
    const explosao = new Error('banco fora do ar');
    mockRpc.mockRejectedValue(explosao);

    const resultado = await upsertMyCall({ id: 'id-throw', direction: 'inbound', status: 'ringing' });

    expect(resultado).toEqual({ ok: false, error: explosao });
    expect(mockRpc).toHaveBeenCalledTimes(3);
  });

  it('não repete quando a primeira tentativa passa', async () => {
    await upsertMyCall({ id: 'id-ok', direction: 'outbound', status: 'ringing' });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});

describe('novoCallId', () => {
  it('usa o sessionId do provider quando existe (um id por chamada)', () => {
    expect(novoCallId('sessao-do-provider')).toBe('sessao-do-provider');
  });

  it('sem sessionId gera um uuid local', () => {
    const id = novoCallId(null);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(novoCallId(undefined)).not.toBe(id);
  });
});

describe('desfechoDaChamada (regra de status do fim)', () => {
  it('atendida → ended/completed', () => {
    expect(desfechoDaChamada(42, 'outbound')).toEqual({ status: 'ended', endReason: 'completed' });
    expect(desfechoDaChamada(0, 'inbound')).toEqual({ status: 'ended', endReason: 'completed' });
  });

  it('entrada não atendida → missed/no_answer', () => {
    expect(desfechoDaChamada(null, 'inbound')).toEqual({ status: 'missed', endReason: 'no_answer' });
  });

  it('saída não atendida → ended/no_answer', () => {
    expect(desfechoDaChamada(null, 'outbound')).toEqual({ status: 'ended', endReason: 'no_answer' });
    expect(desfechoDaChamada(null, null)).toEqual({ status: 'ended', endReason: 'no_answer' });
  });
});

describe('novoCallId/uuidV4 — o id é SEMPRE um uuid válido', () => {
  // `p_id` é `uuid` no banco: um id fora desse formato derruba as 3 tentativas
  // com 22P02 e a chamada NUNCA nasce. Achado do agente DBA da auditoria.
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it('sem `crypto.randomUUID` (Safari/iOS antigo, contexto não-seguro) ainda é uuid v4', () => {
    const original = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: original.getRandomValues.bind(original) });
    try {
      expect(novoCallId(null)).toMatch(UUID_V4);
      expect(uuidV4()).toMatch(UUID_V4);
    } finally {
      vi.stubGlobal('crypto', original);
    }
  });

  it('sem `crypto` nenhum (ambiente cru) ainda é uuid v4', () => {
    const original = globalThis.crypto;
    vi.stubGlobal('crypto', undefined);
    try {
      expect(novoCallId(null)).toMatch(UUID_V4);
    } finally {
      vi.stubGlobal('crypto', original);
    }
  });
});
