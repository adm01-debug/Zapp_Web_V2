/**
 * TL-040 / F73 — Painel 01 (Público) da tela Multiplix.
 *
 * Cada caso monta a TELA REAL (`MultiplixView`) e dirige os controles como o
 * operador: abre o Popover, marca o checkbox, digita no combobox, clica Buscar.
 * Só os hooks de dados (React Query) são dublados — nenhum caminho da tela é
 * dublado. Antes desta entrega:
 *
 *   • "Público" era um <Select> de valor único (papéis não são exclusivos);
 *   • "Ramo" era um <Select> sem busca sobre 566 valores;
 *   • trocar qualquer filtro apagava a seleção (`setSelected(new Set())`);
 *   • digitar no nome só valia depois de clicar Buscar, sem debounce.
 *
 * O `count` (RPC própria de contagem) é observado junto com o `search`: a
 * contagem tem de ser pedida com OS MESMOS filtros que a busca (F73: "3 trocas
 * de filtro, contagem intacta").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';

// cmdk rola o item ativo para a vista e o Radix mede os alvos com
// ResizeObserver — APIs ausentes no jsdom (o setup global só cobre
// IntersectionObserver). Mesmos polyfills dos testes de catálogo/tarefas.
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {};
}

const estado = vi.hoisted(() => ({
  searchMutate: vi.fn(),
  countMutate: vi.fn(),
  ramos: [] as Array<{ ramo_atividade: string; total: number }>,
  ufs: [] as Array<{ uf: string; total: number }>,
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/hooks/integrations/useMultiplixDispatches', () => ({
  useMultiplixDispatchesList: () => ({ data: [], refetch: vi.fn() }),
  useCreateMultiplixDispatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMultiplixAudienceSelect: () => ({ data: [], isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }),
  useMultiplixAudienceSave: () => ({ data: null, isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }),
  useMultiplixAudienceApply: () => ({ data: null, isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }),
}));

// F74 (rebase contra dia/2026-10-09): a tabela do Painel 01 passou a ser
// renderizada por `@tanstack/react-virtual`, que depende de medições de
// layout que o jsdom não fornece (clientHeight fica 0 sem layout real) — sem
// este dublê nenhuma linha vai para o DOM e os testes de seleção (que clicam
// no checkbox de uma linha) não acham o elemento. Mesmo padrão já aceito em
// `MultiplixView.lista-virtualizada.test.tsx`/`VirtualizedRealtimeList.test.tsx`:
// o hook é substituído por um dublê que devolve TODAS as linhas da janela
// pedida (poucas linhas nestes testes, então não precisa de recorte).
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number; estimateSize: (i: number) => number }) => {
    const size = options.estimateSize(0);
    return {
      getTotalSize: () => options.count * size,
      getVirtualItems: () =>
        Array.from({ length: options.count }, (_, index) => ({
          index, size, start: index * size, end: (index + 1) * size, key: index, lane: 0,
        })),
      measure: () => {},
      measureElement: () => {},
    };
  },
}));

vi.mock('@/hooks/integrations/useMultiplixAudience', () => ({
  useMultiplixRamos: () => ({ data: estado.ramos, isLoading: false }),
  useMultiplixUfs: () => ({ data: estado.ufs, isLoading: false }),
  useMultiplixSearch: () => ({
    mutate: (
      vars: Record<string, unknown>,
      opts?: { onSuccess?: (rows: Array<Record<string, unknown>>) => void },
    ) => {
      estado.searchMutate(vars, opts);
      opts?.onSuccess?.(estado.rows);
    },
    isPending: false,
    isError: false,
    error: null,
  }),
  useMultiplixCount: () => ({
    mutate: (vars: Record<string, unknown>) => { estado.countMutate(vars); },
    isPending: false,
    data: undefined,
  }),
  MultiplixOverLimitError: class MultiplixOverLimitError extends Error {},
}));

import MultiplixView from '@/components/multiplix/MultiplixView';

/** Linha de audiência no formato que a edge devolve. */
function linha(companyId: string, companyName: string) {
  return {
    company_id: companyId,
    company_name: companyName,
    ramo_atividade: 'Comércio',
    uf: 'SP',
    is_customer: true,
    is_supplier: false,
    is_carrier: false,
    destino_e164: '+5511999999999',
    destino_origem: 'contato_pessoa',
    motivo_inclusao: 'papel',
  };
}

function gatilho(nome: string) {
  return screen.getByRole('button', { name: nome });
}

function rodapeSelecao() {
  return screen.getByText('empresa(s) selecionada(s)');
}

function buscar() {
  fireEvent.click(screen.getByRole('button', { name: /buscar/i }));
}

beforeEach(() => {
  estado.searchMutate.mockReset();
  estado.countMutate.mockReset();
  estado.ramos = [];
  estado.ufs = [];
  estado.rows = [];
});

describe('MultiplixView · Painel 01 (F73)', () => {
  it('papel: os dois papéis marcados viajam juntos na busca e na contagem', async () => {
    render(<MultiplixView />);

    fireEvent.click(gatilho('Público'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cliente' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fornecedor' }));

    // O gatilho anuncia o que está marcado (antes era um valor único).
    expect(gatilho('Público')).toHaveTextContent('Cliente +1');

    buscar();

    const filtros = { roles: ['cliente', 'fornecedor'] };
    expect(estado.searchMutate).toHaveBeenCalledWith(expect.objectContaining(filtros), expect.anything());
    expect(estado.countMutate).toHaveBeenCalledWith(expect.objectContaining(filtros));
  });

  it('papel: desmarcar volta para "Todos" (nenhum papel no filtro)', async () => {
    render(<MultiplixView />);

    fireEvent.click(gatilho('Público'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Transportadora' }));
    expect(gatilho('Público')).toHaveTextContent('Transportadora');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Transportadora' }));
    expect(gatilho('Público')).toHaveTextContent('Todos');

    buscar();
    expect(estado.searchMutate).toHaveBeenCalledWith(
      expect.objectContaining({ roles: undefined }),
      expect.anything(),
    );
  });

  it('ramo: a busca do combobox acha "Cooperativas de Crédito" digitando "credito"', async () => {
    estado.ramos = [
      { ramo_atividade: 'Cooperativas de Crédito', total: 10698 },
      { ramo_atividade: 'Comércio', total: 5 },
    ];
    render(<MultiplixView />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Ramo' }));
    fireEvent.change(screen.getByPlaceholderText('Buscar ramo…'), { target: { value: 'credito' } });

    expect(screen.getByText('Cooperativas de Crédito')).toBeInTheDocument();
    expect(screen.queryByText('Comércio')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Cooperativas de Crédito'));
    expect(screen.getByRole('combobox', { name: 'Ramo' })).toHaveTextContent('Cooperativas de Crédito');

    buscar();
    expect(estado.searchMutate).toHaveBeenCalledWith(
      expect.objectContaining({ ramo: 'Cooperativas de Crédito' }),
      expect.anything(),
    );
  });

  it('ramo: "Não informado" é ofertado mesmo quando a listagem do servidor não o traz', async () => {
    estado.ramos = [{ ramo_atividade: 'Comércio', total: 5 }];
    render(<MultiplixView />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Ramo' }));
    fireEvent.change(screen.getByPlaceholderText('Buscar ramo…'), { target: { value: 'nao informado' } });

    expect(screen.getByText('Não informado')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Não informado'));

    buscar();
    expect(estado.searchMutate).toHaveBeenCalledWith(
      expect.objectContaining({ ramo: 'Não informado' }),
      expect.anything(),
    );
  });

  it('seleção: sobrevive a 3 trocas de filtro, com a contagem casada a cada troca', async () => {
    estado.ramos = [{ ramo_atividade: 'Farmacêutico', total: 5 }];
    estado.rows = [linha('c1', 'Empresa A'), linha('c2', 'Empresa B')];
    render(<MultiplixView />);

    buscar();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Selecionar Empresa A' }));
    expect(screen.getByRole('checkbox', { name: 'Selecionar Empresa A' })).toBeChecked();
    expect(rodapeSelecao()).toHaveTextContent('1 empresa(s) selecionada(s)');

    // troca 1 — papel
    fireEvent.click(gatilho('Público'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cliente' }));
    buscar();
    expect(screen.getByRole('checkbox', { name: 'Selecionar Empresa A' })).toBeChecked();

    // troca 2 — ramo (combobox)
    fireEvent.click(screen.getByRole('combobox', { name: 'Ramo' }));
    fireEvent.click(screen.getByText('Farmacêutico'));
    buscar();
    expect(screen.getByRole('checkbox', { name: 'Selecionar Empresa A' })).toBeChecked();

    // troca 3 — busca por nome (debounce)
    fireEvent.change(screen.getByPlaceholderText('Nome da empresa...'), { target: { value: 'jose' } });
    await waitFor(() => expect(estado.searchMutate).toHaveBeenCalledTimes(4), { timeout: 2000 });
    expect(screen.getByRole('checkbox', { name: 'Selecionar Empresa A' })).toBeChecked();
    expect(rodapeSelecao()).toHaveTextContent('1 empresa(s) selecionada(s)');

    // Cada uma das 3 trocas pediu a contagem com os MESMOS filtros da busca
    // (1 busca inicial + 3 trocas = 4 chamadas de cada).
    const chamadas = estado.searchMutate.mock.calls.map(([vars]) => vars);
    const contagens = estado.countMutate.mock.calls.map(([vars]) => vars);
    expect(chamadas).toHaveLength(4);
    expect(contagens).toHaveLength(4);
    for (const i of [1, 2, 3]) {
      expect(chamadas[i]).toEqual(expect.objectContaining(contagens[i]));
    }
    expect(chamadas[1]).toEqual(expect.objectContaining({ roles: ['cliente'] }));
    expect(chamadas[2]).toEqual(expect.objectContaining({ ramo: 'Farmacêutico', roles: ['cliente'] }));
    expect(chamadas[3]).toEqual(expect.objectContaining({ search: 'jose', ramo: 'Farmacêutico', roles: ['cliente'] }));
    expect(contagens[3]).toEqual(expect.objectContaining({ search: 'jose', ramo: 'Farmacêutico', roles: ['cliente'] }));
  });

  it('acessibilidade: com os controles novos abertos a tela não tem violação estrutural (axe)', async () => {
    estado.ramos = [{ ramo_atividade: 'Comércio', total: 5 }];
    estado.rows = [linha('c1', 'Empresa A')];
    render(<MultiplixView />);
    buscar();

    // `region` fica de fora: a tela é montada sem o shell do app (sem
    // <main>/landmark), o mesmo ruído de página que a varredura de campanhas
    // registrou como vindo do overlay do tour. As demais regras valem inteiras.
    const semRuidoDePagina = { rules: { region: { enabled: false } } };

    // O conteúdo do Popover vai para um portal fora do `container` — a
    // varredura é no documento, que é onde o achado `button-name` da varredura
    // de campanhas apareceria.
    fireEvent.click(gatilho('Público'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cliente' }));
    expect(await axe(document.body, semRuidoDePagina)).toHaveNoViolations();

    fireEvent.click(screen.getByRole('combobox', { name: 'Ramo' }));
    expect(await axe(document.body, semRuidoDePagina)).toHaveNoViolations();
  });

  it('busca por nome: só refaz a consulta depois do debounce de 300 ms', async () => {
    estado.rows = [linha('c1', 'Empresa A')];
    render(<MultiplixView />);

    buscar();
    expect(estado.searchMutate).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByPlaceholderText('Nome da empresa...'), { target: { value: 'jose' } });
    // Ainda dentro da janela do debounce: nada novo foi pedido.
    expect(estado.searchMutate).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(estado.searchMutate).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(estado.searchMutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'jose' }),
      expect.anything(),
    );
  });
});
