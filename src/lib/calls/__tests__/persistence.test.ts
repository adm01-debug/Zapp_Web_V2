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
import type { CallDirection, CallEndOutcome, EndReason, PersistedStatus } from '../callStatus';

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
  it('atendida → ended/hangup_local (sem `outcome` é legado: ninguém disse quem desligou)', () => {
    expect(desfechoDaChamada(42, 'outbound')).toEqual({ status: 'ended', endReason: 'hangup_local' });
    expect(desfechoDaChamada(0, 'inbound')).toEqual({ status: 'ended', endReason: 'hangup_local' });
  });

  it('entrada não atendida → missed/no_answer', () => {
    expect(desfechoDaChamada(null, 'inbound')).toEqual({ status: 'missed', endReason: 'no_answer' });
  });

  it('saída não atendida → ended/no_answer', () => {
    expect(desfechoDaChamada(null, 'outbound')).toEqual({ status: 'ended', endReason: 'no_answer' });
    expect(desfechoDaChamada(null, null)).toEqual({ status: 'ended', endReason: 'no_answer' });
  });
});

/**
 * T12 — o `end_reason` deixa de ser genérico: quem encerrou (hangup local,
 * remoto, recusa, cancelamento remoto ou timeout) e o código SIP final decidem
 * o que vai para a linha do banco. São estes os 5 casos do aceite do plano:
 * atendida+local, atendida+remoto, 486, cancelamento local antes de atender e
 * 480 na entrada.
 */
describe('desfechoDaChamada com outcome (T12)', () => {
  interface CasoT12 {
    nome: string;
    talkSeconds: number | null;
    direction: CallDirection | null;
    outcome?: CallEndOutcome;
    esperado: { status: PersistedStatus; endReason: EndReason };
  }

  const CASOS: CasoT12[] = [
    {
      nome: 'ACEITE: atendida + desligamento local → ended/hangup_local',
      talkSeconds: 42,
      direction: 'outbound',
      outcome: { endedBy: 'hangup_local', sipCode: null },
      esperado: { status: 'ended', endReason: 'hangup_local' },
    },
    {
      nome: 'ACEITE: atendida + fim pelo outro lado → ended/hangup_remote',
      talkSeconds: 17,
      direction: 'inbound',
      outcome: { endedBy: 'hangup_remote', sipCode: null },
      esperado: { status: 'ended', endReason: 'hangup_remote' },
    },
    {
      nome: 'ACEITE: 486 antes de atender → busy/busy',
      talkSeconds: null,
      direction: 'outbound',
      outcome: { endedBy: 'hangup_remote', sipCode: 486 },
      esperado: { status: 'busy', endReason: 'busy' },
    },
    {
      nome: 'ACEITE: cancelamento local antes de atender → cancelled/cancelled',
      talkSeconds: null,
      direction: 'outbound',
      outcome: { endedBy: 'hangup_local', sipCode: null },
      esperado: { status: 'cancelled', endReason: 'cancelled' },
    },
    {
      nome: 'ACEITE: 480 na entrada → missed/no_answer',
      talkSeconds: null,
      direction: 'inbound',
      outcome: { endedBy: 'hangup_remote', sipCode: 480 },
      esperado: { status: 'missed', endReason: 'no_answer' },
    },
    {
      // A corrida do CANCEL: o servidor pode responder 200 ao INVITE que o
      // usuário já cancelou. Nesse caminho o código é IGNORADO de propósito.
      nome: 'cancelamento local com 200 na resposta ainda é cancelled (corrida do CANCEL)',
      talkSeconds: null,
      direction: 'outbound',
      outcome: { endedBy: 'hangup_local', sipCode: 200 },
      esperado: { status: 'cancelled', endReason: 'cancelled' },
    },
    {
      nome: 'recusa (reject) antes de atender → declined/declined',
      talkSeconds: null,
      direction: 'inbound',
      outcome: { endedBy: 'reject', sipCode: null },
      esperado: { status: 'declined', endReason: 'declined' },
    },
    {
      nome: 'cancelamento remoto (entrada) → missed/cancelled_remote',
      talkSeconds: null,
      direction: 'inbound',
      outcome: { endedBy: 'cancel_remote', sipCode: 487 },
      esperado: { status: 'missed', endReason: 'cancelled_remote' },
    },
    {
      nome: 'timeout local (entrada) → missed/timeout',
      talkSeconds: null,
      direction: 'inbound',
      outcome: { endedBy: 'timeout', sipCode: null },
      esperado: { status: 'missed', endReason: 'timeout' },
    },
    {
      nome: 'falha durante a conversa → failed/failed (não "Concluída")',
      talkSeconds: 8,
      direction: 'outbound',
      outcome: { endedBy: 'failure', sipCode: null },
      esperado: { status: 'failed', endReason: 'failed' },
    },
    {
      nome: '603 na saída antes de atender → declined/declined',
      talkSeconds: null,
      direction: 'outbound',
      outcome: { endedBy: 'hangup_remote', sipCode: 603 },
      esperado: { status: 'declined', endReason: 'declined' },
    },
    {
      nome: 'sem código SIP (remoto encerrou o toque) → ended/no_answer',
      talkSeconds: null,
      direction: 'outbound',
      outcome: { endedBy: 'hangup_remote', sipCode: null },
      esperado: { status: 'ended', endReason: 'no_answer' },
    },
  ];

  for (const caso of CASOS) {
    it(caso.nome, () => {
      expect(desfechoDaChamada(caso.talkSeconds, caso.direction, caso.outcome)).toEqual(caso.esperado);
    });
  }

  it('desfecho ausente/null continua valendo como legado', () => {
    expect(desfechoDaChamada(30, 'outbound', null)).toEqual({ status: 'ended', endReason: 'hangup_local' });
    expect(desfechoDaChamada(null, 'inbound', undefined)).toEqual({ status: 'missed', endReason: 'no_answer' });
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

  it('sem `crypto` nenhum (ambiente cru) ainda é uuid v4 — e único', () => {
    const original = globalThis.crypto;
    vi.stubGlobal('crypto', undefined);
    try {
      const ids = [novoCallId(null), novoCallId(null), novoCallId(null)];
      for (const id of ids) expect(id).toMatch(UUID_V4);
      // O fallback não é aleatório: a unicidade vem do relógio + contador.
      expect(new Set(ids).size).toBe(3);
    } finally {
      vi.stubGlobal('crypto', original);
    }
  });
});
