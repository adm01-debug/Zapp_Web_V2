/**
 * Contatos — `useContactsSearch`: a lista, os filtros, a paginação, os contadores
 * das abas e as duas RPCs "por página" (último contato e permissão de exclusão).
 *
 * O sujeito é o hook REAL, junto do `ContactService` REAL: a única dublagem é a
 * fronteira de rede (`supabase.rpc`), que grava cada chamada e responde o que o
 * teste mandar. Assim o que se prova é o que o hook de fato envia ao banco e o
 * que ele faz com a resposta — inclusive resposta vazia, resposta negada por RLS
 * e resposta com contagem em texto.
 *
 * Fuso: `date_from` é derivado do relógio local do navegador (`setMonth`), então
 * os casos de período congelam o `Date` (só o `Date`, os timers seguem reais) e
 * usam uma data no meio do mês, em que a aritmética de mês é estável em qualquer
 * fuso. O caso do dia 31 fica em `it.fails`: ali a conta transborda (31/03 - 1
 * mês vira 03/03) e o filtro "Mês" encurta a janela em silêncio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Args = Record<string, unknown>;

const h = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  results: {} as Record<string, { data: unknown; error: unknown }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (name: string, args?: Record<string, unknown>) => {
      h.calls.push({ name, args: args ?? {} });
      return Promise.resolve(h.results[name] ?? { data: null, error: null });
    },
  },
}));

import { useContactsSearch } from '../useContactsSearch';

const SEARCH = 'search_contacts';
const COUNT = 'contacts_count_by_type';
const LAST = 'get_last_message_dates';
const DELETABLE = 'can_delete_contacts';

const callsOf = (name: string) => h.calls.filter((c) => c.name === name);

function ultimoArgs(name: string): Args {
  const lista = callsOf(name);
  expect(lista.length).toBeGreaterThan(0);
  return lista[lista.length - 1].args;
}

function contato(id: string, extra: Args = {}) {
  return {
    id,
    name: `Contato ${id}`,
    company: null,
    job_title: null,
    tags: [],
    total_count: 1,
    ...extra,
  };
}

function pagina(n: number, totalCount = 100, fonte = 'c') {
  return Array.from({ length: n }, (_, i) => contato(`${fonte}${i}`, { total_count: totalCount }));
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  const rendered = renderHook(() => useContactsSearch(), { wrapper });
  return { ...rendered, queryClient };
}

/** Estado real da query no cache: é o que prova que a resposta (mesmo negada) chegou e assentou. */
function estado(queryClient: QueryClient, prefixo: string) {
  return queryClient.getQueryCache().getAll().find((q) => q.queryKey[0] === prefixo);
}

const esperaBusca = () => waitFor(() => expect(callsOf(SEARCH).length).toBeGreaterThan(0));

beforeEach(() => {
  h.calls = [];
  h.results = {};
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useContactsSearch — parâmetros enviados ao banco', () => {
  it('primeira carga manda os parâmetros default e NÃO manda include_legacy', async () => {
    h.results[SEARCH] = { data: [contato('c1')], error: null };
    const { result } = setup();
    await esperaBusca();

    const args = ultimoArgs(SEARCH);
    expect(Object.keys(args).sort()).toEqual(
      [
        'search_term',
        'contact_type_filter',
        'company_filter',
        'job_title_filter',
        'tag_filter',
        'date_from',
        'sort_field',
        'sort_direction',
        'page_size',
        'page_offset',
      ].sort(),
    );
    expect(args.search_term).toBe('');
    expect(args.page_size).toBe(50);
    expect(args.page_offset).toBe(0);
    expect(args.sort_field).toBe('name');
    expect(args.sort_direction).toBe('asc');
    expect(args.date_from).toBeUndefined();
    expect(args.contact_type_filter).toBeUndefined();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.contacts).toHaveLength(1);
  });

  it('"Mostrar legados" ligado acrescenta include_legacy nas duas RPCs; desligado a chave nem vai', async () => {
    h.results[SEARCH] = { data: [contato('c1')], error: null };
    h.results[COUNT] = { data: [], error: null };

    const primeira = setup();
    await esperaBusca();
    expect('include_legacy' in ultimoArgs(SEARCH)).toBe(false);
    expect(ultimoArgs(COUNT)).toEqual({});
    primeira.unmount();

    h.calls = [];
    localStorage.setItem('contact-show-legacy', 'true');
    const segunda = setup();
    await esperaBusca();
    expect(ultimoArgs(SEARCH).include_legacy).toBe(true);
    expect(ultimoArgs(COUNT)).toEqual({ include_legacy: true });
    expect(segunda.result.current.showLegacy).toBe(true);
  });

  it('trocar de aba vira contact_type_filter e volta para a página 0', async () => {
    h.results[SEARCH] = { data: pagina(50, 200), error: null };
    const { result } = setup();
    await esperaBusca();

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.page).toBe(1));

    act(() => result.current.setActiveTab('lead'));
    await waitFor(() => expect(ultimoArgs(SEARCH).contact_type_filter).toBe('lead'));
    expect(result.current.page).toBe(0);
    expect(ultimoArgs(SEARCH).page_offset).toBe(0);
  });
});

describe('useContactsSearch — paginação e contagem', () => {
  it('página de 50, hasMore some na última página e loadPrevious não vai a offset negativo', async () => {
    h.results[SEARCH] = { data: pagina(50, 100), error: null };
    const { result } = setup();
    await esperaBusca();
    await waitFor(() => expect(result.current.contacts).toHaveLength(50));

    expect(result.current.pageSize).toBe(50);
    expect(result.current.totalCount).toBe(100);
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    await waitFor(() => expect(ultimoArgs(SEARCH).page_offset).toBe(50));
    expect(result.current.page).toBe(1);
    expect(result.current.hasMore).toBe(false);

    act(() => result.current.loadPrevious());
    await waitFor(() => expect(result.current.page).toBe(0));
    act(() => result.current.loadPrevious());
    expect(result.current.page).toBe(0);
    expect(callsOf(SEARCH).every((c) => Number(c.args.page_offset) >= 0)).toBe(true);
  });

  it('lista vazia: totalCount 0, hasMore false e nenhum contato', async () => {
    h.results[SEARCH] = { data: [], error: null };
    const { result } = setup();
    await esperaBusca();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.totalCount).toBe(0);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.contacts).toEqual([]);
  });

  it('contadores por tipo somam a chave "all" e convertem contagem em texto', async () => {
    h.results[SEARCH] = { data: [contato('c1')], error: null };
    h.results[COUNT] = {
      data: [
        { contact_type: 'lead', count: '3' },
        { contact_type: 'client', count: 4 },
      ],
      error: null,
    };
    const { result } = setup();
    await waitFor(() => expect(result.current.contactCountByType.all).toBe(7));
    expect(result.current.contactCountByType).toEqual({ lead: 3, client: 4, all: 7 });
  });

  it('erro nos contadores (RLS) não derruba a lista: só zera os totais', async () => {
    h.results[SEARCH] = { data: [contato('c1')], error: null };
    h.results[COUNT] = { data: null, error: { message: 'permission denied', code: '42501' } };
    const { result, queryClient } = setup();

    await waitFor(() => expect(estado(queryClient, 'contacts-type-counts')?.state.status).toBe('error'));
    expect(result.current.contactCountByType).toEqual({ all: 0 });
    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('erro de RLS na busca sobe como erro do hook e a lista fica vazia', async () => {
    h.results[SEARCH] = {
      data: null,
      error: { message: 'permission denied for function search_contacts', code: '42501' },
    };
    const { result } = setup();
    await waitFor(() => expect(result.current.error).toBeTruthy());

    expect((result.current.error as Error).message).toContain('permission denied');
    expect(result.current.contacts).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });
});

describe('useContactsSearch — RPCs por página (último contato e exclusão)', () => {
  it('resolve último contato e permissão de exclusão por id, sem trocar contato de linha', async () => {
    h.results[SEARCH] = { data: [contato('c1'), contato('c2'), contato('c3')], error: null };
    h.results[LAST] = {
      data: [
        { contact_id: 'c1', last_message_at: '2026-10-01T10:00:00.000Z' },
        { contact_id: 'c3', last_message_at: '2026-09-20T08:30:00.000Z' },
      ],
      error: null,
    };
    h.results[DELETABLE] = {
      data: [
        { contact_id: 'c1', can_delete: true },
        { contact_id: 'c2', can_delete: false },
        { contact_id: 'c3', can_delete: true },
      ],
      error: null,
    };
    const { result } = setup();
    await waitFor(() => expect(result.current.contacts).toHaveLength(3));
    await waitFor(() =>
      expect(result.current.contacts[0].last_message_at).toBe('2026-10-01T10:00:00.000Z'),
    );

    const porId = Object.fromEntries(result.current.contacts.map((c) => [c.id, c]));
    expect(porId.c1.last_message_at).toBe('2026-10-01T10:00:00.000Z');
    expect(porId.c3.last_message_at).toBe('2026-09-20T08:30:00.000Z');
    expect(porId.c2.last_message_at).toBeNull();
    expect(porId.c1.can_delete).toBe(true);
    expect(porId.c2.can_delete).toBe(false);
    expect(porId.c3.can_delete).toBe(true);

    // As duas RPCs recebem exatamente os ids da página exibida, na mesma ordem.
    expect(ultimoArgs(LAST).contact_ids).toEqual(['c1', 'c2', 'c3']);
    expect(ultimoArgs(DELETABLE).p_ids).toEqual(['c1', 'c2', 'c3']);
  });

  it('falha na RPC do último contato: a lista continua e nenhum item inventa a data', async () => {
    h.results[SEARCH] = { data: [contato('c1'), contato('c2')], error: null };
    h.results[LAST] = {
      data: null,
      error: { message: 'permission denied for function get_last_message_dates', code: '42501' },
    };
    const { result, queryClient } = setup();

    await waitFor(() => expect(estado(queryClient, 'contacts-last-message')?.state.status).toBe('error'));
    expect(result.current.contacts).toHaveLength(2);
    expect(result.current.contacts.every((c) => !('last_message_at' in c))).toBe(true);
  });

  it('RPC de exclusão negada não esconde contato: can_delete fica indefinido e a lista permanece', async () => {
    h.results[SEARCH] = { data: [contato('c1'), contato('c2')], error: null };
    h.results[DELETABLE] = { data: null, error: { message: 'permission denied', code: '42501' } };
    const { result, queryClient } = setup();

    await waitFor(() => expect(estado(queryClient, 'contacts-can-delete')?.state.status).toBe('error'));
    expect(result.current.contacts).toHaveLength(2);
    expect(result.current.contacts.every((c) => 'can_delete' in c)).toBe(true);
    expect(result.current.contacts.every((c) => c.can_delete === undefined)).toBe(true);
  });

  it('lista vazia não dispara as RPCs por página', async () => {
    h.results[SEARCH] = { data: [], error: null };
    const { result } = setup();
    await esperaBusca();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(callsOf(LAST)).toHaveLength(0);
    expect(callsOf(DELETABLE)).toHaveLength(0);
  });
});

describe('useContactsSearch — ordenação e períodos', () => {
  it('cada opção de ordenação vira sort_field/sort_direction; opção desconhecida cai no default', async () => {
    h.results[SEARCH] = { data: [contato('c1')], error: null };
    const { result } = setup();
    await esperaBusca();

    const tabela: Array<[string, string, string]> = [
      ['created_desc', 'created_at', 'desc'],
      ['created_asc', 'created_at', 'asc'],
      ['updated_desc', 'updated_at', 'desc'],
      ['name_desc', 'name', 'desc'],
      ['nao_existe', 'name', 'asc'],
    ];

    for (const [opcao, campo, direcao] of tabela) {
      act(() => result.current.setSortBy(opcao));
      await waitFor(() => expect(ultimoArgs(SEARCH).sort_field).toBe(campo));
      expect(ultimoArgs(SEARCH).sort_direction).toBe(direcao);
      expect(result.current.sortBy).toBe(opcao);
    }
  });

  it('date_from por período usa o relógio local e volta a indefinido em "Todos"', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));
    h.results[SEARCH] = { data: [contato('c1')], error: null };

    const { result } = setup();
    await esperaBusca();
    expect(ultimoArgs(SEARCH).date_from).toBeUndefined();

    const tabela: Array<[string, string]> = [
      ['today', '2026-03-14T12:00:00.000Z'],
      ['week', '2026-03-08T12:00:00.000Z'],
      ['month', '2026-02-15T12:00:00.000Z'],
      ['quarter', '2025-12-15T12:00:00.000Z'],
      ['year', '2025-03-15T12:00:00.000Z'],
    ];

    for (const [periodo, iso] of tabela) {
      act(() => result.current.setFilterDateRange(periodo));
      await waitFor(() => expect(ultimoArgs(SEARCH).date_from).toBe(iso));
    }

    act(() => result.current.setFilterDateRange('all'));
    await waitFor(() => expect(ultimoArgs(SEARCH).date_from).toBeUndefined());
  });

  it.fails('"Mês" a partir do dia 31 recua um mês de calendário (28/02), sem transbordar para 03/03', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-31T12:00:00.000Z'));
    h.results[SEARCH] = { data: [contato('c1')], error: null };

    const { result } = setup();
    await esperaBusca();

    act(() => result.current.setFilterDateRange('month'));
    await waitFor(() => expect(ultimoArgs(SEARCH).date_from).toBe('2026-02-28T12:00:00.000Z'));
  });
});

describe('useContactsSearch — filtros, busca e limpeza', () => {
  it('filtros ativos contam, chegam à RPC e voltam para a página 0', async () => {
    h.results[SEARCH] = { data: pagina(50, 200), error: null };
    const { result } = setup();
    await esperaBusca();

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.page).toBe(1));

    act(() => result.current.setFilterCompany('ACME'));
    await waitFor(() => expect(ultimoArgs(SEARCH).company_filter).toBe('ACME'));
    expect(result.current.page).toBe(0);

    act(() => result.current.setFilterJobTitle('Diretor'));
    act(() => result.current.setFilterTag('vip'));
    await waitFor(() => expect(ultimoArgs(SEARCH).job_title_filter).toBe('Diretor'));
    await waitFor(() => expect(ultimoArgs(SEARCH).tag_filter).toBe('vip'));
    expect(result.current.activeFiltersCount).toBe(3);

    act(() => result.current.setFilterDateRange('week'));
    await waitFor(() => expect(result.current.activeFiltersCount).toBe(4));
    act(() => result.current.setFilterDateRange('all'));
    expect(result.current.activeFiltersCount).toBe(3);
  });

  it('clearFilters limpa filtros, ordem e página, mas não a busca nem a aba', async () => {
    h.results[SEARCH] = { data: pagina(50, 200), error: null };
    const { result } = setup();
    await esperaBusca();

    act(() => result.current.setFilterCompany('ACME'));
    act(() => result.current.setFilterTag('vip'));
    act(() => result.current.setSortBy('created_desc'));
    act(() => result.current.setActiveTab('lead'));
    await waitFor(() => expect(ultimoArgs(SEARCH).company_filter).toBe('ACME'));
    act(() => result.current.loadMore());

    act(() => result.current.clearFilters());
    await waitFor(() => expect(ultimoArgs(SEARCH).company_filter).toBeUndefined());

    expect(result.current.activeFiltersCount).toBe(0);
    expect(result.current.sortBy).toBe('name_asc');
    expect(result.current.filterDateRange).toBe('all');
    expect(result.current.page).toBe(0);
    expect(ultimoArgs(SEARCH).sort_field).toBe('name');
    expect(ultimoArgs(SEARCH).sort_direction).toBe('asc');
    expect(ultimoArgs(SEARCH).date_from).toBeUndefined();
    // Aba e busca seguem como estavam — clearFilters não é "limpar tudo".
    expect(result.current.activeTab).toBe('lead');
  });

  it('digitar espera 400 ms antes de consultar e voltar para a página 0', async () => {
    h.results[SEARCH] = { data: pagina(50, 200, 'c'), error: null };
    const { result } = setup();
    await esperaBusca();
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.page).toBe(1));

    const consultasAntes = callsOf(SEARCH).length;
    act(() => result.current.handleSearchChange('ana'));

    // Sem o debounce, a consulta sairia já aqui.
    expect(result.current.searchInput).toBe('ana');
    expect(result.current.debouncedSearch).toBe('');
    expect(callsOf(SEARCH)).toHaveLength(consultasAntes);

    await waitFor(() => expect(result.current.debouncedSearch).toBe('ana'));
    await waitFor(() => expect(ultimoArgs(SEARCH).search_term).toBe('ana'));
    expect(result.current.page).toBe(0);
    expect(ultimoArgs(SEARCH).page_offset).toBe(0);
  });

  it('a tecla seguinte cancela o debounce anterior: nenhuma consulta com o termo intermediário', async () => {
    h.results[SEARCH] = { data: [contato('c1')], error: null };
    const { result } = setup();
    await esperaBusca();

    act(() => result.current.handleSearchChange('a'));
    act(() => result.current.handleSearchChange('ab'));
    expect(result.current.debouncedSearch).toBe('');

    await waitFor(() => expect(result.current.debouncedSearch).toBe('ab'), { timeout: 2000 });
    await new Promise((r) => setTimeout(r, 600));

    const termos = callsOf(SEARCH).map((c) => c.args.search_term);
    expect(termos).toContain('ab');
    expect(termos).not.toContain('a');
  });

  it('clearSearch zera a busca na hora, sem esperar o debounce', async () => {
    h.results[SEARCH] = { data: pagina(50, 200), error: null };
    const { result } = setup();
    await esperaBusca();

    act(() => result.current.handleSearchChange('ana'));
    await waitFor(() => expect(result.current.debouncedSearch).toBe('ana'));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.page).toBe(1));

    act(() => result.current.clearSearch());
    expect(result.current.searchInput).toBe('');
    expect(result.current.debouncedSearch).toBe('');
    expect(result.current.page).toBe(0);
    await waitFor(() => expect(ultimoArgs(SEARCH).search_term).toBe(''));
  });

  it('toggle de legados grava a preferência, recarrega com include_legacy e volta para a página 0', async () => {
    h.results[SEARCH] = { data: pagina(50, 200), error: null };
    const { result } = setup();
    await esperaBusca();
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.page).toBe(1));

    act(() => result.current.setShowLegacy(true));
    await waitFor(() => expect(ultimoArgs(SEARCH).include_legacy).toBe(true));

    expect(localStorage.getItem('contact-show-legacy')).toBe('true');
    expect(result.current.showLegacy).toBe(true);
    expect(result.current.page).toBe(0);
  });
});

describe('useContactsSearch — valores únicos das listas de filtro', () => {
  it('deduplica empresa/cargo/tags, ignora nulo/vazio e tira as tags de WhatsApp', async () => {
    h.results[SEARCH] = {
      data: [
        contato('c1', { company: 'ACME', job_title: 'Diretor', tags: ['vip', 'wa:123:Suporte'] }),
        contato('c2', { company: 'ACME', job_title: 'Diretor', tags: ['vip'] }),
        contato('c3', { company: '', job_title: '', tags: [] }),
      ],
      error: null,
    };
    const { result } = setup();
    await waitFor(() => expect(result.current.contacts).toHaveLength(3));

    expect(result.current.uniqueCompanies).toEqual(['ACME']);
    expect(result.current.uniqueJobTitles).toEqual(['Diretor']);
    expect(result.current.uniqueTags).toEqual(['vip']);
  });

  it('contato sem a coluna de tags (dado malformado) não derruba a lista', async () => {
    h.results[SEARCH] = {
      data: [{ ...contato('c1', { company: 'ACME' }), tags: undefined }, contato('c2', { tags: ['vip'] })],
      error: null,
    };
    const { result } = setup();
    await waitFor(() => expect(result.current.contacts).toHaveLength(2));

    expect(result.current.uniqueTags).toEqual(['vip']);
    expect(result.current.uniqueCompanies).toEqual(['ACME']);
  });
});
