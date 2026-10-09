/**
 * TL-041C / F75 — painel do Multiplix: seleção preservada na troca de filtro com
 * o aviso "N fora do filtro atual · seleção preservada", exclusões explícitas
 * (que vencem a inclusão), público salvo (regra × lista, com aviso antes de
 * persistir), aplicação mostrando a divergência entre o tamanho da regra e os
 * aptos, e o detalhe do contato.
 *
 * A tela REAL (`MultiplixView`) é montada e os eventos são do usuário; só as
 * FRONTEIRAS são dubladas: os hooks de busca/disparo (a rede) e os dois filhos
 * que abrem outra tela.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { MultiplixAudienceRow } from '@/hooks/integrations/useMultiplixAudience';

const mocks = vi.hoisted(() => ({
  searchMutate: vi.fn(),
  countMutate: vi.fn(),
  selectMutate: vi.fn(),
  saveMutate: vi.fn(),
  applyMutate: vi.fn(),
  resolveMutate: vi.fn(),
}));

vi.mock('@/hooks/integrations/useMultiplixAudience', () => ({
  useMultiplixRamos: () => ({ data: [], isLoading: false }),
  useMultiplixUfs: () => ({ data: [], isLoading: false }),
  useMultiplixSearch: () => ({ mutate: mocks.searchMutate, isPending: false, isError: false, error: null }),
  useMultiplixCount: () => ({ mutate: mocks.countMutate, isPending: false, data: undefined }),
  useMultiplixResolve: () => ({ mutate: mocks.resolveMutate, isPending: false, data: undefined }),
  MultiplixOverLimitError: class MultiplixOverLimitError extends Error {},
}));

vi.mock('@/hooks/integrations/useMultiplixDispatches', () => ({
  useMultiplixDispatchesList: () => ({ data: [], refetch: vi.fn() }),
  useCreateMultiplixDispatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMultiplixAudienceSelect: () => ({ mutate: mocks.selectMutate, isPending: false }),
  useMultiplixAudienceSave: () => ({ mutate: mocks.saveMutate, isPending: false }),
  useMultiplixAudienceApply: () => ({ mutate: mocks.applyMutate, isPending: false }),
}));

// O alvo de vários casos é a lista que a tela entrega ao disparo.
vi.mock('@/components/multiplix/MultiplixComposerDialog', () => ({
  MultiplixComposerDialog: ({ selectedCompanyIds }: { selectedCompanyIds: string[] }) => (
    <div data-testid="disparo">{`disparo:${selectedCompanyIds.join(',')}`}</div>
  ),
}));

vi.mock('@/components/multiplix/MultiplixMonitor', () => ({
  MultiplixMonitor: () => null,
}));

import MultiplixView from '@/components/multiplix/MultiplixView';

function linha(id: string, nome: string, extra: Partial<MultiplixAudienceRow> = {}): MultiplixAudienceRow {
  return {
    company_id: id,
    company_name: nome,
    ramo_atividade: 'Autopeças',
    uf: 'SP',
    is_customer: false,
    is_supplier: true,
    is_carrier: false,
    destino_e164: '+5511987654321',
    destino_origem: 'contato_pessoa',
    motivo_inclusao: 'escopo: fornecedor',
    ...extra,
  };
}

function respostaDe(companyId: string) {
  return {
    company_id: companyId,
    contact_id: null,
    company_name: null,
    destino_e164: null,
    destino_origem: null,
    elegibilidade: 'eligible' as const,
  };
}

/** Clica "Buscar" e entrega a resposta da busca, como a edge faria. */
function responderBusca(rows: MultiplixAudienceRow[]) {
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  const chamada = mocks.searchMutate.mock.calls.at(-1)!;
  act(() => { chamada[1].onSuccess(rows); });
}

/** Responde a comparação feita no servidor: quem da seleção continua no filtro. */
function responderComparacao(dentro: string[]) {
  const chamada = mocks.selectMutate.mock.calls.at(-1)!;
  act(() => {
    chamada[1].onSuccess({
      recipients: dentro.map(respostaDe),
      total: dentro.length,
      eligible_count: dentro.length,
      count: dentro.length,
      policy_limit: 10000,
      primary_per_company: false,
      select_all: false,
      signals: [],
      dropped_out_of_filter: 0,
      excluded_removed: 0,
    });
  });
}

function salvarRegra(nome: string) {
  fireEvent.change(screen.getByLabelText('Nome do público'), { target: { value: nome } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar público' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar e salvar' }));
  act(() => {
    mocks.saveMutate.mock.calls.at(-1)![1].onSuccess({ id: 'pub-1', name: nome, kind: 'rule', member_count: 0 });
  });
}

describe('MultiplixView — F75 (seleção / exclusões / público salvo / detalhe)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserva a seleção na troca de filtro e mostra quantos ficaram fora do filtro atual', () => {
    render(<MultiplixView />);
    responderBusca([linha('c1', 'Alfa'), linha('c2', 'Beta')]);
    fireEvent.click(screen.getByLabelText('Selecionar Alfa'));
    fireEvent.click(screen.getByLabelText('Selecionar Beta'));
    expect(screen.getByTestId('disparo')).toHaveTextContent('disparo:c1,c2');

    // troca de filtro (nome) e busca de novo: a seleção NÃO pode ser apagada
    fireEvent.change(screen.getByPlaceholderText('Nome da empresa...'), { target: { value: 'alfa' } });
    responderBusca([linha('c1', 'Alfa')]);

    // quem responde "quem ficou fora" é o servidor, com o filtro submetido
    const [entrada] = mocks.selectMutate.mock.calls.at(-1)!;
    expect(entrada.manual).toEqual({ companyIds: ['c1', 'c2'] });
    expect(entrada.filters).toEqual({ search: 'alfa' });
    responderComparacao(['c1']);

    expect(screen.getByTestId('aviso-selecao')).toHaveTextContent('1 fora do filtro atual · seleção preservada');
    expect(screen.getByTestId('disparo')).toHaveTextContent('disparo:c1,c2');
  });

  it('deixa marcar exclusão explícita e a exclusão vence a seleção no disparo', () => {
    render(<MultiplixView />);
    responderBusca([linha('c1', 'Alfa'), linha('c2', 'Beta')]);
    fireEvent.click(screen.getByLabelText('Selecionar Alfa'));
    fireEvent.click(screen.getByLabelText('Selecionar Beta'));
    fireEvent.click(screen.getByLabelText('Excluir Beta'));

    expect(screen.getByText(/exclusão vence a seleção/)).toBeInTheDocument();
    expect(screen.getByTestId('disparo')).toHaveTextContent('disparo:c1');
    expect(screen.getByTestId('disparo')).not.toHaveTextContent('c2');
  });

  it('salva público tipo regra só depois do aviso, com os filtros do painel', () => {
    render(<MultiplixView />);
    responderBusca([linha('c1', 'Alfa')]);
    fireEvent.change(screen.getByPlaceholderText('Nome da empresa...'), { target: { value: 'alfa' } });
    fireEvent.change(screen.getByLabelText('Nome do público'), { target: { value: 'Fornecedores alfa' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar público' }));
    const aviso = screen.getByRole('alert');
    expect(aviso).toHaveTextContent('Regra: guarda os filtros do painel (Nome: alfa)');
    expect(aviso).toHaveTextContent('pode divergir dos aptos na hora do disparo');
    expect(mocks.saveMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e salvar' }));
    const [entrada, opcoes] = mocks.saveMutate.mock.calls.at(-1)!;
    expect(entrada).toMatchObject({ name: 'Fornecedores alfa', kind: 'rule' });
    expect(entrada.definition).toEqual({ search: 'alfa' });
    expect(entrada.members).toBeUndefined();

    act(() => {
      opcoes.onSuccess({ id: 'pub-1', name: 'Fornecedores alfa', kind: 'rule', member_count: 0 });
    });
    expect(screen.getByText(/Público salvo: Fornecedores alfa/)).toBeInTheDocument();
  });

  it('salva lista fixa com as selecionadas menos as excluídas e avisa que ela não acompanha o cadastro', () => {
    render(<MultiplixView />);
    responderBusca([linha('c1', 'Alfa'), linha('c2', 'Beta')]);
    fireEvent.click(screen.getByLabelText('Selecionar Alfa'));
    fireEvent.click(screen.getByLabelText('Selecionar Beta'));
    fireEvent.click(screen.getByLabelText('Excluir Beta'));
    fireEvent.change(screen.getByLabelText('Nome do público'), { target: { value: 'Meus fornecedores' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lista fixa (selecionadas)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar público' }));
    const aviso = screen.getByRole('alert');
    expect(aviso).toHaveTextContent('Lista fixa: guarda as 1 empresa(s) selecionadas agora');
    expect(aviso).toHaveTextContent('não acompanha mudanças no cadastro');
    expect(mocks.saveMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e salvar' }));
    const [entrada] = mocks.saveMutate.mock.calls.at(-1)!;
    expect(entrada).toMatchObject({ name: 'Meus fornecedores', kind: 'static_list', members: { companyIds: ['c1'] } });
    expect(entrada.definition).toBeUndefined();
  });

  it('ao aplicar o público, mostra a divergência entre o tamanho da regra e os aptos do servidor', () => {
    render(<MultiplixView />);
    responderBusca([linha('c1', 'Alfa')]);
    fireEvent.change(screen.getByPlaceholderText('Nome da empresa...'), { target: { value: 'alfa' } });
    salvarRegra('Fornecedores alfa');

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar público salvo' }));
    const [entrada, opcoes] = mocks.applyMutate.mock.calls.at(-1)!;
    expect(entrada).toEqual({ audienceId: 'pub-1' });
    act(() => {
      opcoes.onSuccess({
        recipients: [],
        total: 96,
        eligible_count: 96,
        count: 120,
        policy_limit: 10000,
        primary_per_company: false,
        select_all: false,
        signals: [],
        dropped_out_of_filter: 0,
        excluded_removed: 0,
      });
    });

    expect(screen.getByText(/lido do servidor: 120 empresa\(s\) · 96 apta\(s\) agora\./)).toHaveTextContent('A diferença não entra no disparo');
  });

  it('não fala em divergência quando o tamanho da regra bate com os aptos', () => {
    render(<MultiplixView />);
    responderBusca([linha('c1', 'Alfa')]);
    fireEvent.change(screen.getByPlaceholderText('Nome da empresa...'), { target: { value: 'alfa' } });
    salvarRegra('Fornecedores alfa');

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar público salvo' }));
    act(() => {
      mocks.applyMutate.mock.calls.at(-1)![1].onSuccess({
        recipients: [],
        total: 96,
        eligible_count: 96,
        count: 96,
        policy_limit: 10000,
        primary_per_company: false,
        select_all: false,
        signals: [],
        dropped_out_of_filter: 0,
        excluded_removed: 0,
      });
    });

    const leitura = screen.getByText(/lido do servidor: 96 empresa\(s\) · 96 apta\(s\) agora\./);
    expect(leitura).not.toHaveTextContent('A diferença não entra no disparo');
  });

  it('mostra a falha do servidor ao salvar o público em vez de silêncio', () => {
    render(<MultiplixView />);
    responderBusca([linha('c1', 'Alfa')]);
    fireEvent.change(screen.getByPlaceholderText('Nome da empresa...'), { target: { value: 'alfa' } });
    fireEvent.change(screen.getByLabelText('Nome do público'), { target: { value: 'Fornecedores alfa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar público' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e salvar' }));

    act(() => {
      mocks.saveMutate.mock.calls.at(-1)![1].onError(new Error('multiplix_audience_save_failed'));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar o público: multiplix_audience_save_failed');
  });

  it('abre o detalhe do contato com empresa, papéis, origem, destino, elegibilidade e motivo', () => {
    render(<MultiplixView />);
    responderBusca([linha('c1', 'Alfa')]);
    fireEvent.click(screen.getByRole('button', { name: 'Detalhes de Alfa' }));

    const [ids, opcoes] = mocks.resolveMutate.mock.calls.at(-1)!;
    expect(ids).toEqual(['c1']);
    act(() => {
      opcoes.onSuccess([
        {
          company_id: 'c1',
          contact_id: 'ct-1',
          company_name: 'Alfa',
          destino_e164: '+5511987654321',
          destino_origem: 'contato_pessoa',
          elegibilidade: 'eligible',
        },
      ]);
    });

    const detalhe = screen.getByLabelText('Detalhe de Alfa');
    expect(detalhe).toHaveTextContent('Autopeças');
    expect(detalhe).toHaveTextContent('Fornecedor');
    expect(detalhe).toHaveTextContent('Contato');
    expect(detalhe).toHaveTextContent('+5511987654321');
    expect(detalhe).toHaveTextContent('Apto');
    expect(detalhe).toHaveTextContent('escopo: fornecedor');
    // Regra de 07-08/10: nada de selo de canal/origem da mensagem no detalhe.
    expect(detalhe).not.toHaveTextContent('WhatsApp');
  });
});
