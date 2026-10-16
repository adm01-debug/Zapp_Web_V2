/**
 * Busca global — registro de eventos de uso (`search_events`).
 *
 * A trilha de banco (`supabase/migrations/20261016013134_search_events.sql`) cria
 * a tabela de eventos da busca SEM TEXTO LIVRE. O hook passa a registrar:
 *   1. toda busca que roda (comprimento do termo + `had_results`);
 *   2. o clique no resultado (tipo clicado em `result_kind`), por mouse ou teclado.
 * O termo digitado NUNCA entra no evento — só o comprimento.
 *
 * Vermelho antes: `search_events` recebia zero linhas (nada registrava a busca nem
 * o clique). Verde depois: um INSERT por busca, um por clique, com o comprimento
 * no lugar do termo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, renderHook } from '@testing-library/react';

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;

  const state = {
    /** Linhas enviadas ao INSERT de `search_events`. */
    inserts: [] as Row[],
    /** Erro devolvido pelo INSERT (null = sucesso). */
    insertError: null as { message: string } | null,
    user: { id: 'user-1' } as { id: string } | null,
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
    if (table === 'search_events') {
      return {
        insert: (row: Row) => {
          state.inserts.push(row);
          return Promise.resolve({ data: null, error: state.insertError });
        },
      };
    }
    const data = table === 'messages' && state.hasMessage ? [messageRow] : [];
    return thenable({ data, error: null });
  }

  return {
    state,
    logger,
    searchHistory,
    supabase: {
      from,
      auth: { getUser: () => Promise.resolve({ data: { user: state.user }, error: null }) },
    },
  };
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
  // O efeito de montagem agenda um `setTimeout(0)` que limpa os resultados: é a
  // primeira busca do app chegando pelo debounce. Deixa ele queimar antes de
  // chamar o `performSearch` à mão, senão o timer apaga o resultado do teste.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  await act(async () => {
    await hook.result.current.performSearch(term, TYPES, 'all', []);
  });
  return hook;
}

describe('useGlobalSearchData — eventos de uso da busca', () => {
  beforeEach(() => {
    h.state.inserts.length = 0;
    h.state.insertError = null;
    h.state.user = { id: 'user-1' };
    h.state.hasMessage = true;
    h.logger.error.mockClear();
  });

  it('busca com resultado registra comprimento do termo e had_results=true', async () => {
    await performSearch('objeto');

    await waitFor(() => expect(h.state.inserts).toHaveLength(1));
    expect(h.state.inserts[0]).toEqual({
      user_id: 'user-1',
      term_length: 6,
      had_results: true,
      clicked: false,
      result_kind: null,
    });
  });

  it('busca sem resultado registra had_results=false', async () => {
    h.state.hasMessage = false;

    await performSearch('vazio');

    await waitFor(() => expect(h.state.inserts).toHaveLength(1));
    expect(h.state.inserts[0]).toEqual({
      user_id: 'user-1',
      term_length: 5,
      had_results: false,
      clicked: false,
      result_kind: null,
    });
  });

  it('não vaza o termo digitado — nem para o evento, nem para o log', async () => {
    const term = 'cliente-sigiloso-425';

    await performSearch(term);

    await waitFor(() => expect(h.state.inserts).toHaveLength(1));
    const evento = JSON.stringify(h.state.inserts[0]);
    expect(evento).not.toContain('sigiloso');
    expect(evento).not.toContain(term);
    // Só o comprimento vai para a tabela.
    expect(h.state.inserts[0].term_length).toBe(term.length);
    expect(JSON.stringify(h.logger.error.mock.calls)).not.toContain('sigiloso');
  });

  it('sem usuário autenticado não grava evento', async () => {
    h.state.user = null;

    await performSearch('objeto');

    await act(async () => { await Promise.resolve(); });
    expect(h.state.inserts).toHaveLength(0);
  });

  it('falha ao registrar não derruba a busca: o resultado fica e o erro vai ao log', async () => {
    h.state.insertError = { message: 'permission denied' };

    const { result } = await performSearch('objeto');

    await waitFor(() => expect(h.logger.error).toHaveBeenCalledWith('Register search event error:', h.state.insertError));
    expect(result.current.results).toHaveLength(1);
  });
});

describe('GlobalSearch — clique no resultado registra o tipo clicado', () => {
  beforeEach(() => {
    h.state.inserts.length = 0;
    h.state.insertError = null;
    h.state.user = { id: 'user-1' };
    h.state.hasMessage = true;
    h.logger.error.mockClear();
  });

  async function abrirComResultado() {
    render(<GlobalSearch open onOpenChange={vi.fn()} onSelectResult={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Buscar mensagens/i), { target: { value: 'zzzz' } });
    return screen.findByRole('button', { name: /Conversa com Ana Souza/i }, { timeout: 3000 });
  }

  /**
   * Um tique de macrotarefa. O ouvinte de teclado do `GlobalSearch` é registrado
   * num efeito passivo, e o `findByRole` resolve assim que o DOM tem o resultado
   * (efeito passivo ainda pode estar na fila). Sem esta espera o Enter às vezes
   * chega antes do ouvinte e o handler enxerga `navigationTargets` vazio —
   * artefato do teste, não do produto: na tela o Enter vem muito depois da
   * pintura dos resultados.
   */
  async function flushEffects() {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }

  it('clique por teclado (Enter) registra result_kind do resultado selecionado', async () => {
    const onSelectResult = vi.fn();
    render(<GlobalSearch open onOpenChange={vi.fn()} onSelectResult={onSelectResult} />);
    fireEvent.change(screen.getByPlaceholderText(/Buscar mensagens/i), { target: { value: 'zzzz' } });
    await screen.findByRole('button', { name: /Conversa com Ana Souza/i }, { timeout: 3000 });
    await flushEffects();

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(onSelectResult).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      const clique = h.state.inserts.find((row) => row.clicked === true);
      expect(clique).toMatchObject({
        user_id: 'user-1',
        term_length: 4,
        had_results: true,
        clicked: true,
        result_kind: 'message',
      });
    });
  });

  it('clique com o mouse registra o mesmo evento de clique', async () => {
    const resultado = await abrirComResultado();

    fireEvent.click(resultado);

    await waitFor(() => {
      const clique = h.state.inserts.find((row) => row.clicked === true);
      expect(clique).toMatchObject({ clicked: true, result_kind: 'message', term_length: 4 });
    });
  });
});
