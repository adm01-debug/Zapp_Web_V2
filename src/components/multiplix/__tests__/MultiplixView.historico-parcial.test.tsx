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
import { render, screen, fireEvent } from '@testing-library/react';
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
  return render(
    <QueryClientProvider client={qc}>
      <MultiplixView />
    </QueryClientProvider>,
  );
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
    expect(invoke).toHaveBeenCalledWith('multiplix-dispatch', {
      body: { action: 'dispatch.list', payload: { limit: 50, offset: 50 } },
      headers: { Authorization: 'Bearer tok-123' },
    });
  });
});
