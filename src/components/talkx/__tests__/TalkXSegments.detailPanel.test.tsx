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

/** A linha da biblioteca (o diálogo de excluir também cita o nome do segmento). */
function linhaDoSegmento(): HTMLTableRowElement {
  return within(screen.getByRole('table')).getByText('Segmento teste').closest('tr') as HTMLTableRowElement;
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
    // X111: a biblioteca lê o endereço na montagem. O construtor aberto na tela
    // anterior deixa `?segment=…&mode=edit` no histórico; sem limpar, o próximo
    // teste monta direto no construtor em vez da biblioteca.
    window.history.replaceState({}, '', '/');
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

    // O botão Favoritar da linha: a lista volta com a cópia nova (updated_at mais
    // novo) e o painel, que lê o segmento pela id no cache, reflete sem novo clique.
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

  it('Esc com o construtor aberto via "Editar" fecha só o construtor e mantém o painel (linha sem foco)', async () => {
    renderView();
    await abrirPainel();

    // "Editar" do painel abre o construtor (tela interna do módulo, X111).
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    await screen.findByPlaceholderText('Nome do segmento…');

    fireEvent.keyDown(document, { key: 'Escape' });

    // Só o construtor sai; a biblioteca volta com o painel do mesmo segmento.
    await waitFor(() => expect(screen.queryByPlaceholderText('Nome do segmento…')).toBeNull());
    expect(screen.getByText('Detalhes do segmento')).toBeInTheDocument();
    // O Esc do construtor não é o Esc do painel: a linha da tabela não recebe o foco.
    const linhaDepois = linhaDoSegmento();
    expect(linhaDepois).not.toHaveFocus();
    expect(document.activeElement).not.toBe(linhaDepois);
  });

  it('Esc com o aviso de alterações não salvas do construtor fecha só o aviso', async () => {
    renderView();
    await abrirPainel();

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const nome = (await screen.findByPlaceholderText('Nome do segmento…')) as HTMLInputElement;
    // Mexer no nome deixa o construtor "sujo": o "Voltar" abre o aviso do próprio construtor.
    fireEvent.change(nome, { target: { value: 'Segmento mexido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    const aviso = await screen.findByRole('alertdialog');

    fireEvent.keyDown(aviso, { key: 'Escape' });

    // O Esc é do aviso (o Radix marca o evento na captura): o construtor segue
    // aberto com o que foi digitado e o Esc não o fecha por baixo do aviso.
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect((screen.getByPlaceholderText('Nome do segmento…') as HTMLInputElement).value).toBe('Segmento mexido');
  });

  it('Esc com o diálogo de excluir aberto fecha só o diálogo e mantém o painel', async () => {
    renderView();
    await abrirPainel();

    // Diálogo REAL da linha (⋮ → Excluir), no lugar de um div com data-state inventado.
    // O menu Radix abre no pointerdown (padrao dos testes do modulo).
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Ações' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Excluir' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    // O Esc é do diálogo: ele fecha e o painel de baixo continua aberto, sem devolver
    // o foco à linha da tabela por baixo do modal.
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByText('Detalhes do segmento')).toBeInTheDocument();
    const linhaDepois = linhaDoSegmento();
    expect(linhaDepois).not.toHaveFocus();
  });

  it('Esc consumido por outro handler (defaultPrevented) não fecha o painel', async () => {
    renderView();
    await abrirPainel();

    // Outro handler na fase de captura consome o Esc antes do painel.
    // O evento parte de dentro do painel para a captura passar pelo document antes da bolha.
    const alvo = screen.getByText('Principais critérios');
    const consumir = (e: Event) => { if ((e as KeyboardEvent).key === 'Escape') e.preventDefault(); };
    document.addEventListener('keydown', consumir, true);
    try {
      fireEvent.keyDown(alvo, { key: 'Escape' });
      expect(screen.getByText('Detalhes do segmento')).toBeInTheDocument();
    } finally {
      document.removeEventListener('keydown', consumir, true);
    }

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Detalhes do segmento')).toBeNull());
  });

  it('onClose estável: re-render do pai sem trocar o segmento não reinscreve o Esc', async () => {
    // rerender síncrono: a busca tem debounce de 250 ms e não re-renderiza a tempo do spy.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui = (
      <QueryClientProvider client={queryClient}>
        <TalkXSegments onUseCampaign={() => {}} />
      </QueryClientProvider>
    );
    const { rerender } = render(ui);
    await abrirPainel();

    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    try {
      // Re-render do pai com o mesmo segmento selecionado: o onClose
      // estabilizado mantém a mesma ref e o efeito não reinscreve o listener.
      rerender(
        <QueryClientProvider client={queryClient}>
          <TalkXSegments onUseCampaign={() => {}} />
        </QueryClientProvider>,
      );
      expect(screen.getByText('Detalhes do segmento')).toBeInTheDocument();
      expect(removeSpy.mock.calls.filter(([t]) => t === 'keydown')).toHaveLength(0);
      expect(addSpy.mock.calls.filter(([t]) => t === 'keydown')).toHaveLength(0);
    } finally {
      addSpy.mockRestore();
      removeSpy.mockRestore();
    }

    // E o Esc segue fechando depois do re-render.
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Detalhes do segmento')).toBeNull());
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
