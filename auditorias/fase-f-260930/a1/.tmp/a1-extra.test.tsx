/* A1 — sondas extras: ordem dos eventos no debounce e filtro de contato em branco. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React, { type ReactNode } from 'react';
import { useTasksFilters, SEARCH_DEBOUNCE_MS } from '@/hooks/tasks/useTasksFilters';
import { DEFAULT_FILTERS, filtersFromSearch, isFilterActive, searchWithFilters } from '@/hooks/tasks/workItemFilters';
import { applyFilters } from '@/hooks/tasks/workItemAggregates';
import type { WorkItem } from '@/hooks/tasks/workItem.types';

const wrapper = ({ children }: { children: ReactNode }) =>
  React.createElement(MemoryRouter, { initialEntries: ['/'] }, children);

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});

describe('A1 — ordem dos eventos', () => {
  it('E1a filtro primeiro, digitar depois, no MESMO tick', () => {
    const r = renderHook(() => useTasksFilters(), { wrapper });
    act(() => {
      r.result.current.setPrio('high');
      r.result.current.setSearch('liga');
    });
    const logo = { url: window.location.search, f: r.result.current.filters, texto: r.result.current.textoDaBusca };
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2); });
    console.log('A1-E1a ' + JSON.stringify({ logo, depois: { url: window.location.search, f: r.result.current.filters, texto: r.result.current.textoDaBusca, timers: vi.getTimerCount() } }));
    expect(r.result.current.filters.q).toBe('');
  });

  it('E1b digitar primeiro, filtro depois, no MESMO tick', () => {
    const r = renderHook(() => useTasksFilters(), { wrapper });
    act(() => {
      r.result.current.setSearch('liga');
      r.result.current.setPrio('high');
    });
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2); });
    console.log('A1-E1b ' + JSON.stringify({ url: window.location.search, q: r.result.current.filters.q, texto: r.result.current.textoDaBusca }));
    expect(r.result.current.filters.q).toBe('');
  });

  it('E4 segunda digitada recupera (a perda e silenciosa e auto-curável)', () => {
    const r = renderHook(() => useTasksFilters(), { wrapper });
    act(() => { r.result.current.setSearch('liga'); });
    act(() => { r.result.current.setPrio('high'); });
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2); });
    const perdido = { q: r.result.current.filters.q, texto: r.result.current.textoDaBusca, url: window.location.search };
    act(() => { r.result.current.setSearch('liga!'); });
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2); });
    const recuperado = { q: r.result.current.filters.q, texto: r.result.current.textoDaBusca, url: window.location.search };
    console.log('A1-E4 ' + JSON.stringify({ perdido, recuperado }));
    expect(recuperado.q).toBe('liga!');
  });

  it('E5 clear() seguido de digitada no mesmo tick', () => {
    const r = renderHook(() => useTasksFilters(), { wrapper });
    act(() => { r.result.current.setPrio('high'); });
    act(() => {
      r.result.current.clear();
      r.result.current.setSearch('liga');
    });
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2); });
    console.log('A1-E5 ' + JSON.stringify({ url: window.location.search, f: r.result.current.filters, texto: r.result.current.textoDaBusca }));
    expect(true).toBe(true);
  });
});

describe('A1 — contato em branco', () => {
  const base = (i: number): WorkItem => ({
    id: 'w' + i, title: 'T' + i, description: null, status: 'todo', priority: 'medium',
    due_date: null, remind_at: null, notified_at: null, waiting_reason: null, position: i,
    started_at: null, status_changed_at: new Date().toISOString(), completed_at: null,
    contact_id: 'c' + i, created_by: 'u', assigned_to: 'u', created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(), contact: { id: 'c' + i, name: 'X', phone: null, avatar_url: null },
  });
  const itens = [base(1), base(2)];

  it('E2 setContact(" ") -> URL com "+" -> releitura vira filtro ativo sem match', () => {
    const f = { ...DEFAULT_FILTERS, contact: ' ' };
    const url = searchWithFilters('', f);
    const relido = filtersFromSearch(url);
    const resultado = applyFilters(itens, relido);
    console.log('A1-E2 ' + JSON.stringify({
      urlEscrita: url, contatoRelido: JSON.stringify(relido.contact), ativo: isFilterActive(relido),
      itensQueSobram: resultado.length, total: itens.length,
    }));
    expect(url).toContain('contact');
    expect(relido.contact).toBe(' ');
    expect(isFilterActive(relido)).toBe(true);
    expect(resultado.length).toBe(0);
  });

  it('E3 ?contact=%20 (deep-link) -> filtro ativo, zero resultados', () => {
    const relido = filtersFromSearch('?contact=%20');
    console.log('A1-E3 ' + JSON.stringify({ contato: JSON.stringify(relido.contact), ativo: isFilterActive(relido), restam: applyFilters(itens, relido).length }));
    expect(isFilterActive(relido)).toBe(true);
    expect(applyFilters(itens, relido).length).toBe(0);
  });
});
