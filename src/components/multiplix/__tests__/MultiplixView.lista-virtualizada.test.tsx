/**
 * F74 (TL-007) — a tabela do público é virtualizada e "Selecionar todos os N
 * resultados" usa o N do SERVIDOR (`count`, F47). Rebase em dia/2026-10-09
 * (TL-006/F72): a fonte da leitura da seleção passou de
 * `lastComposerProps()?.selectedCompanyIds` para o rodapé da tela
 * (`contagemSelecao()`); o contrato provado não mudou.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// Teto de page_size do servidor (SearchParamsSchema, page_size .max(200)).
const SERVER_PAGE_MAX = 200;
const WINDOW = 25;

interface Row {
  company_id: string; company_name: string; ramo_atividade: string; uf: string | null;
  is_customer: boolean; is_supplier: boolean; is_carrier: boolean;
  destino_e164: string | null; destino_origem: string; motivo_inclusao: string;
}

const state = vi.hoisted(() => ({
  server: [] as unknown[],
  serverCount: undefined as number | undefined,
  declaredCount: undefined as number | undefined,
  virtualizerOptions: [] as Array<{ count: number; estimateSize: (i: number) => number }>,
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number; estimateSize: (i: number) => number }) => {
    state.virtualizerOptions.push(options);
    const size = options.estimateSize(0);
    const visible = Math.min(options.count, 25);
    return {
      getTotalSize: () => options.count * size,
      getVirtualItems: () =>
        Array.from({ length: visible }, (_, index) => ({
          index, size, start: index * size, end: (index + 1) * size, key: index, lane: 0,
        })),
      measure: () => {},
      measureElement: () => {},
    };
  },
}));

const searchMock = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
}));

vi.mock('@/hooks/integrations/useMultiplixAudience', () => ({
  useMultiplixRamos: () => ({ data: [], isLoading: false }),
  useMultiplixUfs: () => ({ data: [], isLoading: false }),
  useMultiplixSearch: () => ({ ...searchMock, isPending: false, isError: false, error: null }),
  useMultiplixCount: () => ({
    // O `count` (F47) é quem sabe o N do servidor; o front nunca deriva o total
    // das linhas carregadas.
    mutate: () => { state.serverCount = state.declaredCount ?? state.server.length; },
    isPending: false,
    data: state.serverCount,
  }),
  MultiplixOverLimitError: class MultiplixOverLimitError extends Error {},
}));

vi.mock('@/hooks/integrations/useMultiplixDispatches', () => ({
  useMultiplixDispatchesList: () => ({ data: [], refetch: vi.fn() }),
  useCreateMultiplixDispatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/components/multiplix/MultiplixMonitor', () => ({
  MultiplixMonitor: () => <div data-testid="monitor" />,
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { toast } from 'sonner';
import MultiplixView from '@/components/multiplix/MultiplixView';

function makeRow(i: number): Row {
  return {
    company_id: `c${i + 1}`,
    company_name: `Empresa ${i + 1}`,
    ramo_atividade: 'Comércio',
    uf: 'SP',
    is_customer: true, is_supplier: false, is_carrier: false,
    destino_e164: '+5511999999999',
    destino_origem: 'contato_pessoa',
    motivo_inclusao: 'Cliente',
  };
}

/** Servidor fake: fatia por page/page_size, como `multiplix_search_audience`. */
function slicePage(filters: { page?: number; page_size?: number }) {
  const page = filters.page ?? 0;
  const size = filters.page_size ?? 50;
  return (state.server as Row[]).slice(page * size, page * size + size);
}

function startSearch() {
  fireEvent.click(screen.getByRole('button', { name: /Buscar/ }));
}

// O tsconfig do projeto não tem `Array.prototype.at` no lib — acesso pelo fim
// com índice.
function lastVirtualizerOptions() {
  return state.virtualizerOptions[state.virtualizerOptions.length - 1];
}

// TL-006/F72: a seleção vive em `selected` (estado da tela) e aparece em DOIS
// rodapés — o da região 01 tem o N dentro de um `<p>` com "selecionada(s)".
function contagemSelecao(): number {
  const p = Array.from(document.querySelectorAll('p')).find((el) => el.textContent?.includes('selecionada(s)'));
  const n = p?.querySelector('strong')?.textContent;
  return n ? Number(n) : 0;
}

beforeEach(() => {
  state.server = [];
  state.serverCount = undefined;
  state.declaredCount = undefined;
  state.virtualizerOptions = [];
  searchMock.mutate.mockReset();
  searchMock.mutateAsync.mockReset();
  vi.mocked(toast.error).mockClear();
  searchMock.mutate.mockImplementation(
    (filters: { page?: number; page_size?: number }, opts?: { onSuccess?: (d: Row[]) => void }) =>
      opts?.onSuccess?.(slicePage(filters)),
  );
  searchMock.mutateAsync.mockImplementation(async (filters: { page?: number; page_size?: number }) => slicePage(filters));
});

describe('MultiplixView — F74 lista virtualizada e "Selecionar todos os N resultados"', () => {
  it('renderiza só a janela do virtualizador e reserva a altura total com 5.000 linhas', async () => {
    state.server = Array.from({ length: 5000 }, (_, i) => makeRow(i));

    render(<MultiplixView />);
    startSearch();

    // 50 linhas carregadas (1 página) — o virtualizador já recebe só elas.
    expect(lastVirtualizerOptions()?.count).toBe(50);

    // Materializa o público inteiro pelo N do servidor.
    fireEvent.click(await screen.findByRole('button', { name: /Selecionar todos os 5\.000 resultados/ }));
    await waitFor(() => expect(lastVirtualizerOptions()?.count).toBe(5000));

    // Só a janela entra no DOM — a linha seguinte à janela não é renderizada.
    // "Empresa 1" também aparece no seletor "Visualizar como" da região 03
    // (prévia — pré-seleciona a 1ª empresa selecionada): o alvo aqui é a
    // TABELA, por isso a busca é escopada a ela.
    expect(document.querySelectorAll('tr[data-index]').length).toBe(WINDOW);
    const tabela = document.querySelector('table') as HTMLTableElement;
    expect(within(tabela).getByText('Empresa 1')).toBeInTheDocument();
    expect(within(tabela).queryByText(`Empresa ${WINDOW + 1}`)).not.toBeInTheDocument();
    expect(within(tabela).queryByText('Empresa 5000')).not.toBeInTheDocument();

    // O corpo reserva a altura cheia (5.000 linhas) para a barra de rolagem.
    const size = lastVirtualizerOptions()!.estimateSize(0);
    const spacer = document.querySelector('tbody tr[aria-hidden="true"]');
    expect(spacer).not.toBeNull();
    expect((spacer as HTMLTableRowElement).querySelector('td')?.style.height).toBe(`${(5000 - WINDOW) * size}px`);
  });



  it('avisa quando selecionar linhas carregadas trunca no teto de política', async () => {
    state.server = Array.from({ length: 10001 }, (_, i) => makeRow(i));
    state.declaredCount = 10001;
    searchMock.mutate.mockImplementationOnce(
      (_filters: { page?: number; page_size?: number }, opts?: { onSuccess?: (d: Row[]) => void }) =>
        opts?.onSuccess?.(state.server as Row[]),
    );

    render(<MultiplixView />);
    startSearch();

    fireEvent.click(await screen.findByRole('checkbox', { name: /Selecionar todas as empresas visíveis/ }));

    await waitFor(() => expect(contagemSelecao()).toBe(10000));
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(expect.stringContaining('primeiras 10.000'));
  });

  it('só avisa o limite de selecionar todos depois do sucesso e com o total real selecionado', async () => {
    state.server = Array.from({ length: 3 }, (_, i) => makeRow(i));
    state.declaredCount = 10001;
    let releaseFirstPage!: (rows: Row[]) => void;
    const firstPage = new Promise<Row[]>((resolve) => { releaseFirstPage = resolve; });
    searchMock.mutateAsync.mockImplementationOnce(() => firstPage);

    render(<MultiplixView />);
    startSearch();

    fireEvent.click(await screen.findByRole('button', { name: /Selecionar todos os 10\.001 resultados/ }));

    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
    releaseFirstPage(state.server as Row[]);

    await waitFor(() => expect(contagemSelecao()).toBe(3));
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(expect.stringContaining('primeiras 3'));
    expect(vi.mocked(toast.error)).not.toHaveBeenCalledWith(expect.stringContaining('primeiras 10.000'));
  });

  it('bloqueia Buscar e Carregar mais enquanto seleciona todos para não misturar filtros', async () => {
    state.server = Array.from({ length: 300 }, (_, i) => makeRow(i));
    let releaseFirstPage!: (rows: Row[]) => void;
    const firstPage = new Promise<Row[]>((resolve) => { releaseFirstPage = resolve; });
    searchMock.mutateAsync.mockImplementationOnce(() => firstPage);

    render(<MultiplixView />);
    startSearch();

    const selectAll = await screen.findByRole('button', { name: /Selecionar todos os 300 resultados/ });
    const loadMore = await screen.findByRole('button', { name: /Carregar mais \(250 restantes\)/ });
    fireEvent.click(selectAll);

    expect(await screen.findByRole('button', { name: /Buscar/ })).toBeDisabled();
    expect(loadMore).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Buscar/ }));
    fireEvent.click(loadMore);
    expect(searchMock.mutate).toHaveBeenCalledTimes(1);

    releaseFirstPage(slicePage({ page: 0, page_size: SERVER_PAGE_MAX }));
    await waitFor(() => expect(contagemSelecao()).toBe(300));
  });

  it('usa o N do servidor (count) e materializa a seleção paginando o servidor', async () => {
    state.server = Array.from({ length: 230 }, (_, i) => makeRow(i));

    render(<MultiplixView />);
    startSearch();

    // N do servidor (230) ≠ página atual carregada (50).
    const selectAll = await screen.findByRole('button', { name: /Selecionar todos os 230 resultados/ });
    expect(screen.getByText('Empresa 1')).toBeInTheDocument();
    expect(screen.queryByText('Empresa 51')).not.toBeInTheDocument();

    fireEvent.click(selectAll);

    await waitFor(() => expect(contagemSelecao()).toBe(230));
    // As 3 primeiras linhas (índices 0-2, dentro da janela do virtualizador
    // a partir do topo) estão selecionadas — confirma que a materialização
    // preservou a ORDEM do servidor, não só a contagem.
    expect(screen.getByLabelText('Selecionar Empresa 1')).toBeChecked();
    expect(screen.getByLabelText('Selecionar Empresa 2')).toBeChecked();
    expect(screen.getByLabelText('Selecionar Empresa 3')).toBeChecked();
    // Confirma os 230 vindos do servidor pelo mesmo rodapé (contagemSelecao).
    expect(contagemSelecao()).toBe(230);

    // Materialização vem do servidor, na maior página que ele aceita.
    expect(searchMock.mutateAsync).toHaveBeenCalledTimes(2);
    expect(searchMock.mutateAsync.mock.calls[0][0]).toMatchObject({ page: 0, page_size: SERVER_PAGE_MAX });
    expect(searchMock.mutateAsync.mock.calls[1][0]).toMatchObject({ page: 1, page_size: SERVER_PAGE_MAX });
  });
});
