import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * X116 (TL-137) — painel "Detalhes do segmento".
 *
 * O painel do rail era um card com o nome do segmento no título, origem em uma
 * linha de texto e nenhuma condição. Faltava: cabeçalho fixo "Detalhes do
 * segmento" com ✕ (Esc fecha e devolve o foco à linha), "Principais critérios"
 * com os chips legíveis + "Editar", origem por extenso, ↻ que reconta o público
 * do segmento, leitura pela id no cache (favoritar reflete sem novo clique) e
 * "Usar em campanha" desabilitado com motivo para segmento inativo.
 *
 * O TalkXSegments REAL entra (motor de regras real, via importOriginal); só a
 * lista/CRUD de segmentos e o cliente Supabase viram spies.
 */

const f = vi.hoisted(() => ({ update: vi.fn(), create: vi.fn(), rpc: vi.fn() }));
const state = vi.hoisted(() => ({ segments: [] as unknown[] }));

const countResposta = { mode: 'count', matched: 42, eligible: 42, suppressed: 0, invalid_phone: 0, legacy_or_deleted: 0 };
const pageResposta = { mode: 'page', rows: [], has_more: false, next_after: null };

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', full_name: 'QA' }, user: { id: 'user-1' }, session: null, loading: false }),
}));

// countAudience/resolveAudience falam com a RPC talkx_resolve_audience (count/page).
vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.not = () => chain;
  chain.or = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.eq = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return { supabase: { from: () => chain, rpc: f.rpc } };
});

vi.mock('@/hooks/integrations/useTalkXSegments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({
      segments: state.segments,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      createSegment: { mutateAsync: f.create },
      updateSegment: { mutateAsync: f.update },
      deleteSegment: { mutate: vi.fn() },
      refreshEstimates: { mutate: vi.fn() },
    }),
  };
});

import { TalkXSegments } from '@/components/talkx/TalkXSegments';
import type { TalkXSegment } from '@/hooks/integrations/useTalkXSegments';

const segmento: TalkXSegment = {
  id: 'seg-1',
  name: 'Segmento teste',
  description: 'Clientes que já compraram',
  origin: 'zapp',
  status: 'active',
  is_favorite: false,
  rules: {
    groups: [
      { id: 'g1', match: 'and', rules: [
        { id: 'r1', field: 'tags', op: 'contains', value: 'VIP' },
        { id: 'r2', field: 'lead_score', op: 'gt', value: '50' },
        { id: 'r3', field: 'updated_at', op: 'in_last_days', value: '30' },
      ] },
    ],
  },
  estimated_count: 120,
  last_used_at: null,
  created_by: null,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
};

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TalkXSegments onUseCampaign={() => {}} />
    </QueryClientProvider>,
  );
}

/** Abre o painel clicando na linha da tabela. */
async function abrirPainel() {
  const linha = await screen.findByText('Segmento teste');
  fireEvent.click(linha);
  await screen.findByText('Detalhes do segmento');
  return linha.closest('tr') as HTMLTableRowElement;
}

describe('TalkXSegments · painel "Detalhes do segmento" (X116)', () => {
  beforeEach(() => {
    state.segments = [{ ...segmento }];
    f.update.mockReset();
    f.create.mockReset();
    f.rpc.mockReset();
    f.rpc.mockImplementation((_name: string, args?: { p_mode?: string }) =>
      Promise.resolve({ data: args?.p_mode === 'page' ? pageResposta : countResposta, error: null }),
    );
  });

  it('mostra "Detalhes do segmento", os critérios por extenso e o "Editar" do construtor', async () => {
    renderView();
    await abrirPainel();

    expect(screen.getByText('Principais critérios')).toBeInTheDocument();
    expect(screen.getByText('Tags contém VIP')).toBeInTheDocument();
    expect(screen.getByText('Lead score maior que 50')).toBeInTheDocument();
    expect(screen.getByText('Última interação nos últimos 30 dias')).toBeInTheDocument();
    // Descrição preenchida: aparece como subtítulo do painel.
    const painel = screen.getByRole('button', { name: 'Fechar' }).closest('section') as HTMLElement;
    expect(within(painel).getByText('Clientes que já compraram')).toBeInTheDocument();
    // Origem por extenso, não a sigla.
    expect(screen.getByText('Dados do ZAPP, em tempo real')).toBeInTheDocument();

    // "Editar" abre o construtor com o segmento aberto.
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const nome = (await screen.findByPlaceholderText('Nome do segmento…')) as HTMLInputElement;
    expect(nome.value).toBe('Segmento teste');
  });

  it('Esc fecha o painel e devolve o foco à linha da tabela', async () => {
    renderView();
    const linha = await abrirPainel();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByText('Detalhes do segmento')).toBeNull());
    expect(screen.getByText('Selecione um segmento')).toBeInTheDocument();
    expect(linha).toHaveFocus();
  });

  it('o ✕ fecha o painel e devolve o foco à linha', async () => {
    renderView();
    const linha = await abrirPainel();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    await waitFor(() => expect(screen.queryByText('Detalhes do segmento')).toBeNull());
    expect(linha).toHaveFocus();
  });

  it('favoritar na tabela reflete no painel sem novo clique na linha', async () => {
    renderView();
    await abrirPainel();
    expect(screen.queryByText('⭐ Favorito')).toBeNull();

    // O botão Favoritar da linha e a consulta da lista é invalidada: a cópia nova
    // (com updated_at mais novo) chega pelo cache.
    fireEvent.click(screen.getByRole('button', { name: 'Favoritar' }));
    state.segments = [{ ...segmento, is_favorite: true, updated_at: '2026-10-09T12:00:00.000Z' }];
    // Re-render equivalente ao da invalidação da query (o hook está mockado).
    fireEvent.change(screen.getByPlaceholderText('Buscar segmentos…'), { target: { value: 'Segmento' } });

    expect(await screen.findByText('⭐ Favorito')).toBeInTheDocument();
    expect(screen.getByText('Detalhes do segmento')).toBeInTheDocument();
  });

  it('segmento inativo: "Usar em campanha" fica desabilitado com o motivo na tela', async () => {
    state.segments = [{ ...segmento, status: 'inactive' }];
    renderView();
    await abrirPainel();

    expect(screen.getByRole('button', { name: 'Usar em campanha' })).toBeDisabled();
    expect(screen.getByText('Segmento inativo: não pode ser usado em campanha.')).toBeInTheDocument();
    expect(screen.getByText('Inativo')).toBeInTheDocument();
  });

  it('o ↻ reconta o público do segmento pela RPC', async () => {
    renderView();
    await abrirPainel();

    const contagens = () => f.rpc.mock.calls.filter(([, args]) => (args as { p_mode?: string })?.p_mode === 'count').length;
    await waitFor(() => expect(contagens()).toBeGreaterThan(0));
    const antes = contagens();

    fireEvent.click(screen.getByRole('button', { name: 'Recontar público deste segmento' }));

    await waitFor(() => expect(contagens()).toBeGreaterThan(antes));
  });
});
