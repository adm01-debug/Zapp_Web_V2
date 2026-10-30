/**
 * TL-043 / F81 — "histórico com filtros (status, período, dono, conexão) e
 * paginação keyset. Feito quando: sem carregar tudo; caso parcial visível."
 *
 * A lista "Disparos recentes" pede UMA página de 50 na edge (`dispatch.list`) e
 * descartava o `meta.total` exato que a própria edge devolve: os 50 apareciam
 * como se fossem o histórico inteiro — nenhum rótulo do caso parcial e nenhum
 * caminho para os mais antigos (a tela só abre o monitor por um clique nessa
 * lista).
 *
 * Este teste monta a tela REAL (`MultiplixView`) com a cadeia REAL do hook —
 * só a borda HTTP é mockada, no `supabase.functions.invoke` — e prova:
 *  1. com 137 disparos no servidor e 50 carregados, o caso parcial está na tela
 *     ("50 de 137") em vez de uma lista que se passa por completa;
 *  2. "Carregar mais antigos" pede a PÁGINA SEGUINTE (offset 50, mesmo limite) e
 *     anexa os mais antigos — sem carregar o histórico inteiro de uma vez.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { invoke, getSession } = vi.hoisted(() => ({ invoke: vi.fn(), getSession: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => getSession(...args) },
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    // Sem `from`: qualquer leitura direta de tabela falharia aqui.
  },
}));

vi.mock('@/hooks/integrations/useMultiplixAudience', () => ({
  useMultiplixRamos: () => ({ data: [], isLoading: false }),
  useMultiplixUfs: () => ({ data: [], isLoading: false }),
  useMultiplixSearch: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useMultiplixCount: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
  MultiplixOverLimitError: class MultiplixOverLimitError extends Error {},
}));

// Foco do teste é a lista de recentes -> quem a abre não é o alvo aqui.
vi.mock('@/components/multiplix/MultiplixMonitor', () => ({ MultiplixMonitor: () => null }));
vi.mock('@/components/multiplix/MultiplixComposerDialog', () => ({ MultiplixComposerDialog: () => null }));

import MultiplixView from '@/components/multiplix/MultiplixView';

/** Total EXATO do servidor (o `meta.total` do `dispatch.list`). */
const HISTORY_TOTAL = 137;

function dispatchRow(i: number) {
  return {
    id: `d${i}`,
    name: `Disparo ${i}`,
    message_template: 'oi',
    status: 'completed',
    total_recipients: 10,
    sent_count: 10,
    failed_count: 0,
    delivered_count: 0,
    outcome_unknown_count: 0,
    started_at: null,
    paused_at: null,
    pause_reason: null,
    completed_at: null,
    created_at: `2026-10-01T10:00:${String(i % 60).padStart(2, '0')}Z`,
  };
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <MultiplixView />
    </QueryClientProvider>,
  );
  return { qc, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
  // A edge devolve `{ data: rows, meta: { limit, offset, total } }` (contract de
  // `handleDispatchList`): a página 1 traz os 50 mais recentes, a seguinte os
  // mais antigos — sempre com o total exato do servidor.
  invoke.mockImplementation((_fn: string, options: { body: { payload: { offset?: number } } }) => {
    const offset = options.body.payload.offset ?? 0;
    const rows = offset === 0
      ? Array.from({ length: 50 }, (_, i) => dispatchRow(i + 1))
      : Array.from({ length: 10 }, (_, i) => dispatchRow(offset + i + 1));
    return Promise.resolve({
      data: { data: rows, meta: { limit: 50, offset, total: HISTORY_TOTAL } },
      error: null,
    });
  });
});

describe('MultiplixView — histórico parcial ("Disparos recentes", TL-043/F81)', () => {
  it('mostra o total do servidor (caso parcial visível) em vez de lista que parece completa', async () => {
    renderView();

    expect(await screen.findByText('50 de 137')).toBeInTheDocument();
    expect(screen.getByText('Carregar mais antigos')).toBeInTheDocument();
    // A página veio da edge com o limite do hook — nada de "carregar tudo".
    expect(invoke).toHaveBeenCalledWith('multiplix-dispatch', {
      body: { action: 'dispatch.list', payload: { limit: 50, offset: 0 } },
      headers: { Authorization: 'Bearer tok-123' },
    });
  });

  it('"Carregar mais antigos" pede a página seguinte e anexa os mais antigos', async () => {
    renderView();

    fireEvent.click(await screen.findByText('Carregar mais antigos'));

    // 51..60 chegam e o rótulo passa a contar as duas páginas.
    expect(await screen.findByText('60 de 137')).toBeInTheDocument();
    expect(screen.getByText('Disparo 51')).toBeInTheDocument();
    expect(screen.getByText('Disparo 1')).toBeInTheDocument();
    // Ordem "mais novo primeiro": a página 0 (d1..d50) continua no topo e os
    // mais antigos (d51..d60) vêm depois — o dedup não reordena a lista.
    const el1 = screen.getByText('Disparo 1');
    const el51 = screen.getByText('Disparo 51');
    expect(el1.compareDocumentPosition(el51) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(invoke).toHaveBeenCalledWith('multiplix-dispatch', {
      body: { action: 'dispatch.list', payload: { limit: 50, offset: 50 } },
      headers: { Authorization: 'Bearer tok-123' },
    });
  });

  it('a página 0 (mais nova) vence o dedup quando o mesmo id volta numa página antiga', async () => {
    // A página 0 é refeita pelo polling do hook a cada 10 s. Carregados os
    // antigos (d51..d60), um disparo novo aparece e a página 0 passa a trazer
    // d60 de novo, agora com o conteúdo NOVO. A versão da página 0 tem de
    // vencer — antes a ordem invertida do dedup deixava a versão antiga
    // sobrescrever a nova.
    let paginaZeroAposNova = false;
    invoke.mockImplementation((_fn: string, options: { body: { payload: { offset?: number } } }) => {
      const offset = options.body.payload.offset ?? 0;
      let rows;
      if (offset === 0) {
        rows = paginaZeroAposNova
          ? [{ ...dispatchRow(60), name: 'Disparo 60 (pagina 0, nova)' }, ...Array.from({ length: 49 }, (_, i) => dispatchRow(i + 1))]
          : Array.from({ length: 50 }, (_, i) => dispatchRow(i + 1));
      } else {
        rows = Array.from({ length: 10 }, (_, i) => dispatchRow(offset + i + 1));
      }
      return Promise.resolve({
        data: { data: rows, meta: { limit: 50, offset, total: HISTORY_TOTAL } },
        error: null,
      });
    });

    const { qc } = renderView();
    fireEvent.click(await screen.findByText('Carregar mais antigos'));
    await screen.findByText('60 de 137');
    // d60 entrou pela página antiga ("Disparo 60").
    expect(screen.getByText('Disparo 60')).toBeInTheDocument();

    // A página 0 refaz (polling) e agora traz d60 com o conteúdo novo.
    paginaZeroAposNova = true;
    await act(async () => {
      await qc.refetchQueries({ queryKey: ['multiplix-dispatches-list'] });
    });

    // A linha vencedora é a da página 0; a versão antiga não aparece e o mesmo
    // id não vira duas linhas.
    expect(await screen.findByText('Disparo 60 (pagina 0, nova)')).toBeInTheDocument();
    expect(screen.queryByText('Disparo 60')).not.toBeInTheDocument();
    expect(screen.getAllByText('Disparo 60 (pagina 0, nova)')).toHaveLength(1);
  });

  it('loadOlder não duplica id já carregado quando a página antiga repete a linha', async () => {
    // A página antiga (offset 50) repete d40 — já carregado na página 0 — com
    // outro conteúdo. O append por id filtra: o id não entra duas vezes e a
    // linha da página 0 continua sendo a que se vê.
    invoke.mockImplementation((_fn: string, options: { body: { payload: { offset?: number } } }) => {
      const offset = options.body.payload.offset ?? 0;
      const rows = offset === 0
        ? Array.from({ length: 50 }, (_, i) => dispatchRow(i + 1))
        : [{ ...dispatchRow(40), name: 'Disparo 40 (pagina antiga)' }, ...Array.from({ length: 10 }, (_, i) => dispatchRow(51 + i))];
      return Promise.resolve({
        data: { data: rows, meta: { limit: 50, offset, total: HISTORY_TOTAL } },
        error: null,
      });
    });

    renderView();
    fireEvent.click(await screen.findByText('Carregar mais antigos'));

    // d40 aparece uma única vez e com o conteúdo da página 0.
    expect(await screen.findByText('Disparo 40')).toBeInTheDocument();
    expect(screen.getAllByText('Disparo 40')).toHaveLength(1);
    expect(screen.queryByText('Disparo 40 (pagina antiga)')).not.toBeInTheDocument();
    // 50 da página 0 + 10 novos (o repetido não infla a contagem).
    expect(await screen.findByText('60 de 137')).toBeInTheDocument();
  });
});
