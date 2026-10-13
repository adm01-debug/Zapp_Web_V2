/**
 * Cartão: reabrir/desarquivar conversa — a RPC no hook (camada de dados).
 *
 * Prova que `reopenConversation` chama a RPC `reopen_conversation` (a MESMA que o
 * gatilho do contato usa) com o parâmetro certo, devolve o status novo (para quem
 * chamou levar a lista ao chip correto) e trata os dois casos de retorno:
 * `reopened=false` (já estava ativa, nada mudou) e erro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

function resultChain(result: Record<string, unknown>) {
  const obj: Record<string, unknown> = {};
  obj.eq = vi.fn(() => obj);
  obj.gt = vi.fn(() => obj);
  obj.order = vi.fn(() => obj);
  obj.select = vi.fn(() => obj);
  obj.in = vi.fn(() => obj);
  obj.single = vi.fn(() => obj);
  obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return obj;
}

const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
let reopenResult: Record<string, unknown> = { data: null, error: null };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    rpc: vi.fn((name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === 'reopen_conversation') return Promise.resolve(reopenResult);
      return Promise.resolve({ data: null, error: null });
    }),
    from: vi.fn(() => ({ select: vi.fn(() => resultChain({ data: [], error: null })) })),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { useConversationActions } from '../useConversationActions';
import { toast } from 'sonner';

const LINHA_REABERTA = {
  contact_id: 'c-1',
  conversation_status: 'waiting',
  conversation_status_changed_at: '2026-10-13T12:00:00Z',
  event_id: 'e-1',
  reopened: true,
};

beforeEach(() => {
  rpcCalls.length = 0;
  vi.clearAllMocks();
  reopenResult = { data: [LINHA_REABERTA], error: null };
});

describe('useConversationActions — reopenConversation', () => {
  it('chama reopen_conversation com p_contact_id e devolve o status novo', async () => {
    const { result } = renderHook(() => useConversationActions());

    let retorno: Awaited<ReturnType<typeof result.current.reopenConversation>> | undefined;
    await act(async () => { retorno = await result.current.reopenConversation('c-1'); });

    expect(rpcCalls).toEqual([{ name: 'reopen_conversation', args: { p_contact_id: 'c-1' } }]);
    expect(retorno).toEqual({ status: 'waiting', reopened: true });
    expect(toast.success).toHaveBeenCalledWith('Conversa reaberta');
  });

  it('devolve "open" quando a conversa reabre já atribuída', async () => {
    reopenResult = { data: [{ ...LINHA_REABERTA, conversation_status: 'open' }], error: null };
    const { result } = renderHook(() => useConversationActions());

    let retorno: Awaited<ReturnType<typeof result.current.reopenConversation>> | undefined;
    await act(async () => { retorno = await result.current.reopenConversation('c-2'); });

    expect(retorno).toEqual({ status: 'open', reopened: true });
  });

  it('reopened=false avisa que já estava ativa e devolve o estado atual', async () => {
    reopenResult = { data: [{ ...LINHA_REABERTA, conversation_status: 'open', reopened: false }], error: null };
    const { result } = renderHook(() => useConversationActions());

    let retorno: Awaited<ReturnType<typeof result.current.reopenConversation>> | undefined;
    await act(async () => { retorno = await result.current.reopenConversation('c-3'); });

    expect(retorno).toEqual({ status: 'open', reopened: false });
    expect(toast.info).toHaveBeenCalledWith('A conversa já está ativa');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('erro da RPC devolve null e avisa (nada de sucesso silencioso)', async () => {
    reopenResult = { data: null, error: { message: 'permissão negada' } };
    const { result } = renderHook(() => useConversationActions());

    let retorno: Awaited<ReturnType<typeof result.current.reopenConversation>> | undefined;
    await act(async () => { retorno = await result.current.reopenConversation('c-4'); });

    expect(retorno).toBeNull();
    expect(toast.error).toHaveBeenCalledWith('Erro ao reabrir conversa. Tente novamente.');
    expect(toast.success).not.toHaveBeenCalled();
  });
});
