import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
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

  it('Fase F: o "Limpar" cancela o debounce pendente — o filtro não ressuscita', () => {
    const { result } = renderFiltros();

    act(() => { result.current.setSearch('liga'); });
    act(() => { result.current.clear(); });

    // O timer do debounce ficou vivo: sem cancelar, 200ms depois o `q` volta
    // (campo vazio, lista recortada e `?q=liga` na URL) — o bug ALTO da auditoria.
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2); });

    expect(result.current.filters.q).toBe('');
    expect(result.current.textoDaBusca).toBe('');
    expect(result.current.isActive).toBe(false);
    expect(window.location.search).toBe('');
  });

  it('F3 (auditoria A1-1): mexer em OUTRO filtro dentro da janela do debounce não descarta a busca', () => {
    const { result } = renderFiltros();

    act(() => { result.current.setSearch('liga'); });
    // Dentro dos 200ms do debounce, outro filtro muda — e o próprio hook reescreve
    // `window.location.search` com `?prio=high`.
    act(() => { result.current.setPrio('high'); });
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });

    // O bug A1-1: a guarda `agora !== base` comparava `window.location.search` — a
    // MESMA URL que este hook reescreve a cada filtro — então o timer via "a URL
    // mudou" e retornava sem despachar. O campo mostrava "liga", o filtro ficava
    // vazio e a URL nunca recebia `q`: a lista não recortava o que o campo prometia.
    expect(result.current.filters.q).toBe('liga');
    expect(result.current.filters.prio).toBe('high');
    expect(new URLSearchParams(window.location.search).get('q')).toBe('liga');
    expect(result.current.isActive).toBe(true);
  });

  it('Fase F: deep-link que chega DEPOIS de montar reidrata os filtros (o router manda)', () => {
    let ir: (to: string) => void = () => {};
    const Espiao = () => { ir = useNavigate(); return null; };

    const { result } = renderHook(() => useTasksFilters(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={['/']}>
          <Espiao />
          {children}
        </MemoryRouter>
      ),
    });

    expect(result.current.filters.prio).toBe('all');

    act(() => { ir('/?q=liga&prio=high'); });

    expect(result.current.filters.q).toBe('liga');
    expect(result.current.filters.prio).toBe('high');
    expect(result.current.textoDaBusca).toBe('liga');
  });
});
