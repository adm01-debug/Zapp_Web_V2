import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React, { type ReactNode } from 'react';
import { useTasksFilters, SEARCH_DEBOUNCE_MS } from '../useTasksFilters';

/**
 * Etapa 45: o hook dos filtros — `useReducer` + debounce de 200ms na busca +
 * espelho na URL por `replaceState` (sem empilhar histórico).
 */

const wrapper = (search = '') => ({ children }: { children: ReactNode }) =>
  React.createElement(MemoryRouter, { initialEntries: [`/${search}`] }, children);

function renderFiltros(search = '') {
  return renderHook(() => useTasksFilters(), { wrapper: wrapper(search) });
}

describe('etapa 45 — useTasksFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
  });

  it('nasce dos parâmetros da URL', () => {
    const { result } = renderFiltros('?q=liga&prio=high&alarm=1&done=0');
    expect(result.current.filters).toEqual({ q: 'liga', prio: 'high', contact: null, alarm: true, done: false });
    expect(result.current.isActive).toBe(true);
  });

  it('a busca só vira filtro depois do debounce de 200ms', () => {
    const { result } = renderFiltros();

    act(() => { result.current.setSearch('liga'); });
    // o texto anda na hora, o filtro não
    expect(result.current.textoDaBusca).toBe('liga');
    expect(result.current.filters.q).toBe('');

    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
    expect(result.current.filters.q).toBe('liga');
  });

  it('cada controle mexe no seu pedaço do estado e deixa a URL refletir', () => {
    const { result } = renderFiltros();

    act(() => { result.current.setPrio('urgent'); });
    act(() => { result.current.setContact('c7'); });
    act(() => { result.current.toggleAlarm(); });
    act(() => { result.current.toggleDone(); });

    expect(result.current.filters).toEqual({ q: '', prio: 'urgent', contact: 'c7', alarm: true, done: false });

    const url = new URLSearchParams(window.location.search);
    expect(url.get('prio')).toBe('urgent');
    expect(url.get('contact')).toBe('c7');
    expect(url.get('alarm')).toBe('1');
    expect(url.get('done')).toBe('0');
  });

  it('"limpar" volta tudo ao padrão, inclusive a URL', () => {
    const { result } = renderFiltros('?q=liga&prio=low');

    act(() => { result.current.clear(); });

    expect(result.current.filters.q).toBe('');
    expect(result.current.filters.prio).toBe('all');
    expect(result.current.isActive).toBe(false);
    expect(window.location.search).toBe('');
  });

  it('o estado padrão não escreve nada na URL', () => {
    const { result } = renderFiltros();
    expect(result.current.isActive).toBe(false);
    expect(window.location.search).toBe('');
  });
});
