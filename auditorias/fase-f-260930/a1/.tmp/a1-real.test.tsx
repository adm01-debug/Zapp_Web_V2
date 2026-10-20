/* A1 — reproducao em tempo real (sem fake timers) do debounce perdido. */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import React, { type ReactNode } from 'react';
import { useTasksFilters } from '@/hooks/tasks/useTasksFilters';

const noite = (ms: number) => new Promise(res => setTimeout(res, ms));

function montar() {
  window.history.replaceState(null, '', '/tarefas');
  let loc = '';
  const Espiao = () => { loc = useLocation().search; return null; };
  const r = renderHook(() => useTasksFilters(), {
    wrapper: ({ children }: { children: ReactNode }) => (<BrowserRouter><Espiao />{children}</BrowserRouter>),
  });
  return { r, loc: () => loc };
}

describe('A1 — debounce em tempo real', () => {
  it('R1) digitar, 100ms depois clicar em "Alta", esperar 300ms', async () => {
    const { r, loc } = montar();
    act(() => { r.result.current.setSearch('liga'); });
    await act(async () => { await noite(100); });              // humano clica na chip
    const antesDoChip = { q: r.result.current.filters.q, texto: r.result.current.textoDaBusca, barra: window.location.search };
    act(() => { r.result.current.setPrio('high'); });
    await act(async () => { await noite(300); });              // passa o debounce
    const final = { q: r.result.current.filters.q, prio: r.result.current.filters.prio, texto: r.result.current.textoDaBusca, barra: window.location.search, router: loc() };
    console.log('A1-R1 ' + JSON.stringify({ antesDoChip, final }));
    expect(final.q).toBe('');     // CAMPO mostra 'liga', FILTRO nao aplicou, URL sem q
    expect(final.texto).toBe('liga');
  });

  it('R2) digitar, 250ms (aplica), clicar em "Alta" — caso bom para contraste', async () => {
    const { r, loc } = montar();
    act(() => { r.result.current.setSearch('liga'); });
    await act(async () => { await noite(250); });
    act(() => { r.result.current.setPrio('high'); });
    await act(async () => { await noite(300); });
    console.log('A1-R2 ' + JSON.stringify({ q: r.result.current.filters.q, prio: r.result.current.filters.prio, barra: window.location.search, router: loc() }));
    expect(r.result.current.filters.q).toBe('liga');
  });

  it('R3) clicar em "Alta" e digitar em seguida', async () => {
    const { r, loc } = montar();
    act(() => { r.result.current.setPrio('high'); });
    act(() => { r.result.current.setSearch('liga'); });
    await act(async () => { await noite(300); });
    console.log('A1-R3 ' + JSON.stringify({ q: r.result.current.filters.q, prio: r.result.current.filters.prio, texto: r.result.current.textoDaBusca, barra: window.location.search, router: loc() }));
    expect(true).toBe(true);
  });
});
