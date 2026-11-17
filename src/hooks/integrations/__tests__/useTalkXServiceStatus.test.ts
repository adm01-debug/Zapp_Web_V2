/**
 * X048 (TL-106) — testes do hook useTalkXServiceStatus.
 * Cobre as 3 combinações do campo whatsapp.connected.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom,
  },
}));

import { useTalkXServiceStatus } from '../useTalkXServiceStatus';

function makeChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useTalkXServiceStatus', () => {
  it('whatsapp.connected = true quando existe conexão ativa', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [{ id: 'conn-1' }], error: null }));

    const { result } = renderHook(() => useTalkXServiceStatus());

    // Começa null enquanto a consulta não responde
    expect(result.current.whatsapp.connected).toBeNull();

    await waitFor(() => expect(result.current.whatsapp.connected).toBe(true));
    // Sem assercao de `crm`: a versao original da branch devolvia `crm: 'ok'`
    // cravado, e o hook da main recusou esse campo de proposito enquanto o
    // CAP-092 nao expuser o sinal real (useTalkXServiceStatus.ts:21-24).
  });

  it('whatsapp.connected = false quando não existe conexão ativa', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }));

    const { result } = renderHook(() => useTalkXServiceStatus());

    await waitFor(() => expect(result.current.whatsapp.connected).toBe(false));
  });

  it('whatsapp.connected = null quando a consulta falha (não acusa "desconectado")', async () => {
    // A resposta e' controlada de proposito. Com `makeChain` + `waitFor` o teste
    // passava no PRIMEIRO tick, antes de a consulta falhar: o estado inicial ja'
    // e' null, e um hook que marcasse erro como `setConnected(false)` ainda
    // passaria — justamente a regressao que este teste existe para impedir
    // (apontado por Devin e Codex na #3238).
    let responder: (v: { data: unknown; error: unknown }) => void = () => {};
    const resposta = new Promise<{ data: unknown; error: unknown }>((r) => {
      responder = r;
    });
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnValue(resposta),
    };
    mockFrom.mockReturnValue(chain);

    const { result } = renderHook(() => useTalkXServiceStatus());
    expect(result.current.whatsapp.connected).toBeNull();

    await act(async () => {
      responder({ data: null, error: { message: 'network error' } });
      await resposta;
    });

    // Agora o erro JA' foi processado: segue null, nao false.
    expect(chain.limit).toHaveBeenCalled();
    expect(result.current.whatsapp.connected).toBeNull();
  });
});
