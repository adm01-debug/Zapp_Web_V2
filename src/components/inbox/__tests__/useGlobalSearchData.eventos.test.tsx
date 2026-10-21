/**
 * Busca global — registro do evento de uso via RPC `log_search_event`.
 *
 * A trilha de banco (cartão pai `t_d15d3a92`,
 * `supabase/migrations/20261026100000_search_event_rpc.sql`) complementa a tabela
 * `search_events` para o cliente (RLS ligada, zero policy, REVOKE de
 * anon/authenticated) e expõe UM caminho de escrita:
 * `log_search_event(p_term, p_result_count, p_clicked, p_event_id, p_result_kind)`.
 * O termo é descartado na RPC; o ID permite atualizar o mesmo evento no clique.
 * pela RPC — o cliente só faz um filtro LEVE (telefone/e-mail/token nem saem
 * daqui).
 *
 * O hook passa a registrar:
 *   1. toda busca que termina (termo com 3+ caracteres), em segundo plano;
 *   2. o clique no resultado (`p_clicked = true`), por mouse ou teclado.
 *
 * Uma busca e seu clique usam o mesmo identificador para contar como um evento.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, renderHook } from '@testing-library/react';

const h = vi.hoisted(() => {
  const state = {
    /** Chamadas à RPC: { fn, args }. */
    rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
    /** Erro devolvido pela RPC (null = sucesso). */
    rpcError: null as { message: string } | null,
    /** A busca de mensagens devolve uma linha? */
    hasMessage: true,
  };

  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  /**
   * Identidades ESTÁVEIS: o hook real devolve callbacks memoizados e o
   * `performSearch` depende deles. Devolver `vi.fn()` novo a cada render faria o
   * efeito de busca reexecutar e agendar outro `setTimeout` que limpa os
   * resultados — artefato do mock, não do produto.
   */
  const searchHistory = {
    history: [] as unknown[],
    addToHistory: vi.fn(),
    removeFromHistory: vi.fn(),
    clearHistory: vi.fn(),
  };

  const messageRow = {
    id: 'msg-1',
    content: 'mensagem da busca',
    message_type: 'text',
    created_at: '2026-10-05T10:00:00.000Z',
    contact_id: 'contact-9',
    contacts: { id: 'contact-9', name: 'Ana', surname: 'Souza' },
  };

  /** Cadeia PostgREST "thenable": qualquer método devolve a própria cadeia e o `await` resolve `{ data, error }`. */
  function thenable(value: unknown) {
    const proxy: unknown = new Proxy({} as Record<string, unknown>, {
      get(_target, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => unknown) => resolve(value);
        return () => proxy;
      },
    });
    return proxy;
  }

  function from(table: string) {
    const data = table === 'messages' && state.hasMessage ? [messageRow] : [];
    return thenable({ data, error: null });
  }

  function rpc(fn: string, args: Record<string, unknown>) {
    state.rpcCalls.push({ fn, args });
    return Promise.resolve({ data: null, error: state.rpcError });
  }

  return { state, logger, searchHistory, supabase: { from, rpc } };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: h.supabase }));
vi.mock('@/lib/logger', () => ({ log: h.logger, getLogger: () => h.logger }));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => ({ isSupervisor: false, roles: [] }) }));
vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({ useCRMIntegrationEnabled: () => false }));
vi.mock('@/hooks/system/useSearchHistory', () => ({
  useSearchHistory: () => h.searchHistory,
}));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));

import { useGlobalSearchData, type ResultType } from '../useGlobalSearchData';
import { GlobalSearch } from '../GlobalSearch';

const TYPES = new Set<ResultType>(['message', 'contact']);

async function performSearch(term: string) {
  const hook = renderHook(() => useGlobalSearchData(true));
  // O efeito de montagem agenda um `setTimeout(0)` que limpa os resultados: deixa
  // ele queimar antes de chamar o `performSearch` à mão, senão o timer apaga o
  // resultado do teste.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  await act(async () => {
    await hook.result.current.performSearch(term, TYPES, 'all', []);
  });
  return hook;
}

describe('useGlobalSearchData — evento de uso da busca (RPC log_search_event)', () => {
  beforeEach(() => {
    h.state.rpcCalls.length = 0;
    h.state.rpcError = null;
    h.state.hasMessage = true;
    h.logger.error.mockClear();
  });

  it('busca com 3+ caracteres registra UMA chamada com id estável e a contagem', async () => {
    await performSearch('objeto');

    await waitFor(() => expect(h.state.rpcCalls).toHaveLength(1));
    expect(h.state.rpcCalls[0].fn).toBe('log_search_event');
    expect(h.state.rpcCalls[0].args).toMatchObject({
      p_term: 'objeto', p_result_count: 1, p_clicked: false, p_result_kind: null,
    });
    expect(h.state.rpcCalls[0].args.p_event_id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/i));
  });

  it('busca sem resultado registra a contagem zero', async () => {
    h.state.hasMessage = false;

    await performSearch('vazio');

    await waitFor(() => expect(h.state.rpcCalls).toHaveLength(1));
    expect(h.state.rpcCalls[0].args).toMatchObject({
      p_term: 'vazio', p_result_count: 0, p_clicked: false, p_result_kind: null,
    });
  });

  it('termo curto (menos de 3 caracteres) não chama a RPC', async () => {
    await performSearch('ab');

    await act(async () => { await Promise.resolve(); });
    expect(h.state.rpcCalls).toHaveLength(0);
  });

  it('termo com e-mail não chama a RPC (barreira leve no cliente)', async () => {
    await performSearch('ana.souza@exemplo.com');

    await act(async () => { await Promise.resolve(); });
    expect(h.state.rpcCalls).toHaveLength(0);
  });

  it('termo com telefone não chama a RPC e nada do termo vai para o log', async () => {
    await performSearch('11987654321');

    await act(async () => { await Promise.resolve(); });
    expect(h.state.rpcCalls).toHaveLength(0);
    expect(JSON.stringify(h.logger.error.mock.calls)).not.toContain('11987654321');
  });

  it('o mesmo termo não é registrado duas vezes (uma chamada por termo)', async () => {
    const hook = await performSearch('objeto');

    await act(async () => {
      await hook.result.current.performSearch('objeto', TYPES, 'all', []);
    });

    expect(h.state.rpcCalls).toHaveLength(1);
  });

  it('busca curta não marca evento anterior e a busca retomada recebe novo ID', async () => {
    const hook = await performSearch('objeto');
    const primeiroId = h.state.rpcCalls[0].args.p_event_id;

    await act(async () => {
      await hook.result.current.performSearch('ab', TYPES, 'all', []);
    });
    act(() => hook.result.current.registerResultClick('message'));
    expect(h.state.rpcCalls).toHaveLength(1);

    await act(async () => {
      await hook.result.current.performSearch('objeto', TYPES, 'all', []);
    });
    expect(h.state.rpcCalls).toHaveLength(2);
    const segundoId = h.state.rpcCalls[1].args.p_event_id;
    expect(segundoId).not.toBe(primeiroId);

    act(() => hook.result.current.registerResultClick('message'));
    await waitFor(() => expect(h.state.rpcCalls).toHaveLength(3));
    expect(h.state.rpcCalls[2].args.p_event_id).toBe(segundoId);
  });

  it('erro da RPC não derruba a busca: o resultado fica e o erro vai ao log', async () => {
    h.state.rpcError = { message: 'permission denied' };

    const { result } = await performSearch('objeto');

    await waitFor(() => expect(h.logger.error).toHaveBeenCalledWith('Register search event error:', h.state.rpcError));
    expect(result.current.results).toHaveLength(1);
    expect(JSON.stringify(h.logger.error.mock.calls)).not.toContain('objeto');
  });
});

describe('GlobalSearch — clique no resultado registra p_clicked', () => {
  beforeEach(() => {
    h.state.rpcCalls.length = 0;
    h.state.rpcError = null;
    h.state.hasMessage = true;
    h.logger.error.mockClear();
  });

  it('clique por teclado (Enter) registra o evento de clique do termo buscado', async () => {
    const onSelectResult = vi.fn();
    render(<GlobalSearch open onOpenChange={vi.fn()} onSelectResult={onSelectResult} />);
    fireEvent.change(screen.getByPlaceholderText(/Buscar mensagens/i), { target: { value: 'zzzz' } });
    await screen.findByRole('button', { name: /Conversa com Ana Souza/i }, { timeout: 3000 });

    await waitFor(() => expect(h.state.rpcCalls).toHaveLength(1));
    fireEvent.keyDown(document, { key: 'Enter' });

    expect(onSelectResult).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      const clique = h.state.rpcCalls.find((call) => call.args.p_clicked === true);
      expect(clique).toEqual({
        fn: 'log_search_event',
        args: expect.objectContaining({
          p_term: 'zzzz', p_result_count: 1, p_clicked: true, p_result_kind: 'message',
        }),
      });
      expect(clique?.args.p_event_id).toBe(h.state.rpcCalls[0].args.p_event_id);
    });
  });
});
