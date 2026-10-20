import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CT-011 — ponto de ligação da busca instantânea na barra de busca (`contacts.v2.toolbar`).
 *
 * O que se prova aqui:
 *  - com a sub-chave LIGADA, o campo é o da busca instantânea: a resposta chega
 *    no debounce curto com o TRECHO ENCONTRADO destacado (e o texto digitado
 *    segue alimentando a lista, via `onSearchChange`);
 *  - nenhum contato casando, aparece "nada encontrado" com a AÇÃO útil (voltar
 *    aos contatos todos), que limpa o campo de verdade;
 *  - com a sub-chave DESLIGADA, a barra é exatamente a atual (o campo anterior
 *    e nenhuma consulta da busca nova).
 */

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  flags: {
    toolbar: false,
    cards: false,
    detalhe: false,
    empresa: false,
    edicao: false,
    protecao: false,
  },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: h.rpc } }));
vi.mock('@/hooks/contacts/useContactsV2Flags', () => ({ useContactsV2Flags: () => h.flags }));
vi.mock('../ContactSearchWithSuggestions', () => ({
  ContactSearchWithSuggestions: () => <input data-testid="busca-atual" readOnly />,
}));
vi.mock('../ContactAdvancedFilters', () => ({ ContactAdvancedFilters: () => null }));
vi.mock('../FilterPresets', () => ({ FilterPresets: () => null }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
}));

import { ContactToolbar } from '../ContactToolbar';
import { CONTACT_SEARCH_DEBOUNCE_MS } from '@/hooks/contacts/useContactSearchV2';

type RespostaRpc = { data: unknown; error: unknown };

function pendente() {
  let resolver!: (valor: RespostaRpc) => void;
  const promise = new Promise<RespostaRpc>((resolve) => {
    resolver = resolve;
  });
  return { promise, resolver };
}

/** Linha no formato que a RPC `search_contacts` devolve. */
function linha(sobrescreve: Record<string, unknown> = {}) {
  return {
    id: 'contato-1',
    name: 'Ana Souza',
    nickname: 'Aninha',
    surname: null,
    job_title: 'Compras',
    company: 'Brindes Sul',
    phone: null,
    email: null,
    avatar_url: null,
    tags: null,
    notes: null,
    contact_type: 'cliente',
    created_at: '2026-10-08T00:00:00Z',
    updated_at: '2026-10-08T00:00:00Z',
    latitude: null,
    longitude: null,
    total_count: 1,
    ...sobrescreve,
  };
}

function toolbarProps(
  overrides: Partial<React.ComponentProps<typeof ContactToolbar>> = {},
): React.ComponentProps<typeof ContactToolbar> {
  const noop = () => {};
  return {
    searchInput: '',
    onSearchChange: noop,
    sortBy: 'name_asc',
    setSortBy: noop,
    showLegacy: false,
    setShowLegacy: noop,
    showFilters: false,
    setShowFilters: noop,
    activeFiltersCount: 0,
    clearFilters: noop,
    activeTab: 'all',
    filterCompany: '',
    setFilterCompany: noop,
    filterJobTitle: '',
    setFilterJobTitle: noop,
    filterTag: '',
    setFilterTag: noop,
    filterDateRange: '',
    setFilterDateRange: noop,
    uniqueCompanies: [],
    uniqueJobTitles: [],
    uniqueTags: [],
    onApplyPreset: noop,
    groupByCompany: false,
    setGroupByCompany: noop,
    selectedIds: [],
    onBulkTag: noop,
    onCompare: noop,
    onMerge: noop,
    canMerge: false,
    viewMode: 'list',
    setViewMode: noop,
    gridColumns: 3,
    setGridColumns: noop,
    totalCount: 0,
    crmIntegrationEnabled: false,
    onOpenCRM: noop,
    ...overrides,
  };
}

async function avancarDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(CONTACT_SEARCH_DEBOUNCE_MS);
  });
}

async function entregar(
  alvo: { promise: Promise<RespostaRpc>; resolver: (v: RespostaRpc) => void },
  valor: RespostaRpc,
) {
  await act(async () => {
    alvo.resolver(valor);
    await alvo.promise;
  });
}

/** Digita no campo da busca instantânea (o termo é controlado pela barra). */
function digitar(campo: HTMLElement, valor: string) {
  fireEvent.focus(campo);
  fireEvent.change(campo, { target: { value: valor } });
}

function campoV2() {
  return screen.getByRole('textbox', { name: 'Buscar por nome, apelido ou empresa' });
}

function painelResultados() {
  return document.getElementById('contact-search-v2-resultados');
}

beforeEach(() => {
  vi.useFakeTimers();
  h.rpc.mockReset();
  h.flags = { toolbar: false, cards: false, detalhe: false, empresa: false, edicao: false, protecao: false };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ContactToolbar · busca instantânea (contacts.v2.toolbar ligada)', () => {
  it('mostra o trecho encontrado e alimenta a lista com o que foi digitado', async () => {
    h.flags = { ...h.flags, toolbar: true };
    const resposta = pendente();
    h.rpc.mockReturnValueOnce(resposta.promise);
    const onSearchChange = vi.fn();

    const { rerender } = render(<ContactToolbar {...toolbarProps({ onSearchChange })} />);
    digitar(campoV2(), 'an');

    // A lista continua recebendo cada tecla (comportamento atual preservado).
    expect(onSearchChange).toHaveBeenCalledWith('an');

    rerender(<ContactToolbar {...toolbarProps({ searchInput: 'an', onSearchChange })} />);
    await avancarDebounce();
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect((h.rpc.mock.calls[0][1] as Record<string, unknown>).search_term).toBe('an');

    await entregar(resposta, { data: [linha()], error: null });

    // O trecho que casou está destacado e o contato aparece inteiro na lista.
    expect(document.querySelector('mark')?.textContent).toBe('An');
    expect(painelResultados()?.textContent).toContain('Ana Souza');
    expect(painelResultados()?.textContent).toContain('Brindes Sul');
    expect(painelResultados()?.textContent).toContain('1 contato');
  });

  it('sem contato com o termo, oferece "nada encontrado" com a ação que limpa o campo', async () => {
    h.flags = { ...h.flags, toolbar: true };
    const vazia = pendente();
    h.rpc.mockReturnValueOnce(vazia.promise);
    const onSearchChange = vi.fn();

    const { rerender } = render(<ContactToolbar {...toolbarProps({ onSearchChange })} />);
    digitar(campoV2(), 'zzz');
    rerender(<ContactToolbar {...toolbarProps({ searchInput: 'zzz', onSearchChange })} />);
    await avancarDebounce();
    await entregar(vazia, { data: [], error: null });

    expect(screen.getByText(/Nenhum contato com/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ver todos os contatos/ }));
    expect(onSearchChange).toHaveBeenLastCalledWith('');
  });

  it('com a sub-chave desligada, a barra é a atual e a busca nova não consulta', async () => {
    render(<ContactToolbar {...toolbarProps()} />);

    expect(screen.getByTestId('busca-atual')).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Buscar por nome, apelido ou empresa' }),
    ).not.toBeInTheDocument();

    await avancarDebounce();
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
