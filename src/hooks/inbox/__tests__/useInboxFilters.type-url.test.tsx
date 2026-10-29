/**
 * PK-14 — o `?type=` da Inbox passa pelo roteador e só aceita tipo conhecido.
 *
 * Antes, `useInboxFilters` gravava o `type` com `window.history.replaceState` por
 * fora do roteador (e lia `window.location`). Qualquer outra troca de filtro usa
 * `useSearchParams` e reescreve a query a partir do estado do router, que nunca
 * recebeu o `type` — então o filtro de tipo sumia ao mexer em status/tag/data.
 * Além disso, um valor desconhecido virava estado: a tela mostrava "filtrando por
 * X" sem recortar nada (passesExtraFilters ignora tipo que não existe).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';

vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: () => false }));

import { useInboxFilters } from '../useInboxFilters';

const PROFILE = 'p1';

const conversa = (id: string, nome: string, phone: string, contactType: string, groupCategory: string | null = null) => ({
  id,
  unreadCount: 0,
  messages: [{ id: `m-${id}` }],
  lastMessage: { id: `m-${id}`, created_at: '2026-10-08T12:00:00.000Z' },
  contact: {
    id,
    name: nome,
    phone,
    email: null,
    created_at: '2026-10-01T12:00:00.000Z',
    updated_at: '2026-10-08T12:00:00.000Z',
    assigned_to: PROFILE,
    conversation_status: 'open',
    tags: [],
    queue_id: null,
    contact_type: contactType,
    group_category: groupCategory,
  },
});

// "ana" é pessoa (cliente); "grp" é grupo de orçamentos.
const CONVERSAS = [
  conversa('ana', 'Ana Souza', '5511988887777', 'cliente'),
  conversa('grp', 'Grupo Orçamentos', '1203630-555', 'grupo', 'orcamentos'),
] as never;

// Guarda o que o ROTEADOR enxerga (não o window.location) — é esse o caminho que
// os outros filtros usam e onde o `type` precisa aparecer. A escrita fica no
// useEffect (e não no render), como pede a regra react-hooks/globals.
const routerSearchRef: { current: string } = { current: '' };
function Probe() {
  const { search } = useLocation();
  useEffect(() => {
    routerSearchRef.current = search;
  }, [search]);
  return null;
}

const wrapperFor = (initial: string) =>
  ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initial]}>
      <Probe />
      {children}
    </MemoryRouter>
  );

const montar = (initial = '/inbox') =>
  renderHook(
    () => useInboxFilters({ conversations: CONVERSAS, profileId: PROFILE }),
    { wrapper: wrapperFor(initial) },
  );

const ids = (r: { current: ReturnType<typeof useInboxFilters> }) =>
  r.current.filteredConversations.map((c) => c.contact.id).sort();

beforeEach(() => {
  routerSearchRef.current = '';
  localStorage.clear();
});

describe('useInboxFilters — type pela URL (PK-14)', () => {
  it('aplica o tipo conhecido da URL e recorta a lista', () => {
    const { result } = montar('/inbox?type=cliente');
    expect(result.current.selectedContactType).toBe('cliente');

    act(() => result.current.setChipTab('all'));
    expect(ids(result)).toEqual(['ana']);
  });

  it('aplica o tipo de grupo da URL', () => {
    const { result } = montar('/inbox?type=grupo');
    expect(result.current.selectedContactType).toBe('grupo');

    act(() => result.current.setChipTab('all'));
    expect(ids(result)).toEqual(['grp']);
  });

  it('ignora tipo desconhecido em vez de dizer que filtra', () => {
    const { result } = montar('/inbox?type=nao-existe');
    expect(result.current.selectedContactType).toBeNull();

    act(() => result.current.setChipTab('all'));
    expect(ids(result)).toEqual(['ana', 'grp']);
  });

  it('grava o tipo no roteador (não em window.location)', () => {
    const { result } = montar('/inbox');
    expect(routerSearchRef.current).not.toContain('type=');

    act(() => result.current.handleContactTypeChange('grupo'));

    expect(result.current.selectedContactType).toBe('grupo');
    expect(routerSearchRef.current).toContain('type=grupo');
  });

  it('o tipo sobrevive à troca de outro filtro (o defeito do cartão)', () => {
    const { result } = montar('/inbox');

    act(() => result.current.handleContactTypeChange('grupo'));
    // Outra troca de filtro: passa pelo mesmo setSearchParams e reescreve a query.
    act(() => result.current.setFilters({ status: [], tags: [], agentId: null, dateRange: { from: null, to: null } }));
    act(() => result.current.setFilters({ status: [], tags: [], agentId: PROFILE, dateRange: { from: null, to: null } }));

    expect(routerSearchRef.current).toContain('type=grupo');
    expect(routerSearchRef.current).toContain('agent=p1');
    expect(result.current.selectedContactType).toBe('grupo');
  });

  it('limpar o tipo (null ou "all") tira do roteador e da lista', () => {
    const { result } = montar('/inbox?type=grupo');
    act(() => result.current.setChipTab('all'));
    expect(ids(result)).toEqual(['grp']);

    act(() => result.current.handleContactTypeChange(null));
    expect(result.current.selectedContactType).toBeNull();
    expect(routerSearchRef.current).not.toContain('type=');
    expect(ids(result)).toEqual(['ana', 'grp']);

    act(() => result.current.handleContactTypeChange('cliente'));
    act(() => result.current.handleContactTypeChange('all'));
    expect(result.current.selectedContactType).toBeNull();
    expect(routerSearchRef.current).not.toContain('type=');
    expect(ids(result)).toEqual(['ana', 'grp']);
  });
});

describe('useInboxFilters — busca em memória (PK-14)', () => {
  it('a busca nunca vai para a URL e recorta a lista', () => {
    const { result } = montar('/inbox');
    act(() => result.current.setChipTab('all'));

    act(() => result.current.setSearch('ana'));
    expect(result.current.search).toBe('ana');
    expect(ids(result)).toEqual(['ana']);
    expect(routerSearchRef.current).not.toContain('ana');
  });

  it('descartar os termos: zera a busca e a lista volta ao todo', () => {
    const { result } = montar('/inbox');
    act(() => result.current.setChipTab('all'));

    act(() => result.current.setSearch('zzz-nao-existe'));
    expect(result.current.filteredConversations).toHaveLength(0);

    act(() => result.current.setSearch(''));
    expect(ids(result)).toEqual(['ana', 'grp']);
  });

  it('a lista e os contadores dos chips usam o mesmo contexto (uma varredura)', () => {
    const { result } = montar('/inbox');
    act(() => result.current.setChipTab('all'));

    act(() => result.current.setSearch('ana'));

    // O chip "all" reflete exatamente o length da lista com a busca atual.
    expect(result.current.chipCounts.all).toBe(result.current.filteredConversations.length);
    expect(result.current.chipCounts.all).toBe(1);
  });
});
