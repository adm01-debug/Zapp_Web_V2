/* A1 — sonda de precisao: efeito de escrita na URL apos navegacao do router (BrowserRouter, timers REAIS). */
import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { BrowserRouter, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import React, { type ReactNode } from 'react';
import { useTasksFilters } from '@/hooks/tasks/useTasksFilters';

function montar(inicial: string) {
  window.history.replaceState(null, '', inicial);
  let ir: (to: string) => void = () => {};
  let loc = { search: '', pathname: '' };
  let sp = new URLSearchParams();
  const Espiao = () => {
    ir = useNavigate();
    const l = useLocation();
    loc = { search: l.search, pathname: l.pathname };
    sp = useSearchParams()[0];
    return null;
  };
  const r = renderHook(() => useTasksFilters(), {
    wrapper: ({ children }: { children: ReactNode }) => (<BrowserRouter><Espiao />{children}</BrowserRouter>),
  });
  return { r, ir: (t: string) => ir(t), loc: () => loc, sp: () => sp };
}

describe('A1 — escrita na URL apos navegacao (timers reais)', () => {
  it('P1) filtro -> navigate("/") -> a URL fica limpa e o filtro continua aplicado?', async () => {
    const { r, ir, loc, sp } = montar('/');
    act(() => { r.result.current.setPrio('high'); });
    const comFiltro = { barra: window.location.search, router: loc().search, prio: r.result.current.filters.prio };

    act(() => { ir('/'); });
    const logo = { barra: window.location.search, router: loc().search, prio: r.result.current.filters.prio };

    await act(async () => { await new Promise(res => setTimeout(res, 50)); });
    const depois = { barra: window.location.search, router: loc().search, prio: r.result.current.filters.prio, veApp: sp().get('prio') };

    console.log('A1-P1 ' + JSON.stringify({ comFiltro, logo, depois }));
    expect(depois.prio).toBe('high');
  });

  it('P2) navigate para a MESMA search e depois mexer num filtro', async () => {
    const { r, ir, loc, sp } = montar('/');
    act(() => { r.result.current.setPrio('high'); });
    act(() => { ir('/'); });
    await act(async () => { await new Promise(res => setTimeout(res, 50)); });
    const aposNavigate = { barra: window.location.search, prio: r.result.current.filters.prio, veApp: sp().get('prio') };
    act(() => { r.result.current.toggleAlarm(); });
    await act(async () => { await new Promise(res => setTimeout(res, 50)); });
    const aposTocar = { barra: window.location.search, prio: r.result.current.filters.prio };
    console.log('A1-P2 ' + JSON.stringify({ aposNavigate, aposTocar }));
    expect(true).toBe(true);
  });

  it('P3) debounce: digitar -> esperar 250ms reais -> a busca aplicou?', async () => {
    const { r, loc } = montar('/');
    act(() => { r.result.current.setSearch('liga'); });
    const logo = { q: r.result.current.filters.q, texto: r.result.current.textoDaBusca };
    await act(async () => { await new Promise(res => setTimeout(res, 300)); });
    const depois = { q: r.result.current.filters.q, texto: r.result.current.textoDaBusca, barra: window.location.search, router: loc().search };
    console.log('A1-P3 ' + JSON.stringify({ logo, depois }));
    expect(depois.q).toBe('liga');
  });

  it('P4) digitar -> 250ms (aplica) -> mudar prio -> o q sobrevive?', async () => {
    const { r } = montar('/');
    act(() => { r.result.current.setSearch('liga'); });
    await act(async () => { await new Promise(res => setTimeout(res, 300)); });
    const aplicado = { q: r.result.current.filters.q, barra: window.location.search };
    act(() => { r.result.current.setPrio('high'); });
    await act(async () => { await new Promise(res => setTimeout(res, 50)); });
    const final = { q: r.result.current.filters.q, prio: r.result.current.filters.prio, barra: window.location.search };
    console.log('A1-P4 ' + JSON.stringify({ aplicado, final }));
    expect(final.q).toBe('liga');
  });
});
