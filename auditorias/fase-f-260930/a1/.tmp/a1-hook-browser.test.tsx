/* A1 — sondas do hook useTasksFilters com BrowserRouter (igual a producao: src/App.tsx usa BrowserRouter). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { BrowserRouter, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import React, { type ReactNode } from 'react';
import { useTasksFilters, SEARCH_DEBOUNCE_MS } from '@/hooks/tasks/useTasksFilters';

function renderComRouter(inicial: string) {
  window.history.replaceState(null, '', inicial);
  let ir: (to: string | number) => void = () => {};
  let loc: { search: string; pathname: string } = { search: '', pathname: '' };
  let sp: URLSearchParams = new URLSearchParams();
  const Espiao = () => {
    ir = useNavigate();
    const l = useLocation();
    loc = { search: l.search, pathname: l.pathname };
    sp = useSearchParams()[0];
    return null;
  };
  const r = renderHook(() => useTasksFilters(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <BrowserRouter><Espiao />{children}</BrowserRouter>
    ),
  });
  return { ...r, ir: (to: string | number) => ir(to), loc: () => loc, sp: () => sp };
}

let est = 0;
function snap(r: { result: { current: ReturnType<typeof useTasksFilters> } }) {
  return {
    id: ++est,
    filters: r.result.current.filters,
    texto: r.result.current.textoDaBusca,
    urlBarra: window.location.search,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});

describe('A1 — BrowserRouter (producao)', () => {
  it('B0 sanity: jsdom esta servindo um http(s) valido', () => {
    console.log('A1-B0 ' + JSON.stringify({ href: window.location.href, origin: window.location.origin }));
    expect(window.location.href.startsWith('http')).toBe(true);
  });

  it('B1 as filtragens ficam na barra de enderecos mas o react-router nunca as ve', () => {
    const r = renderComRouter('/?q=liga');
    const mount = { barra: window.location.search, routerSearch: r.loc().search, useSearchParamsQ: r.sp().get('q') };
    act(() => { r.result.current.setPrio('high'); });
    const apos = { barra: window.location.search, routerSearch: r.loc().search, useSearchParamsQ: r.sp().get('q'), useSearchParamsPrio: r.sp().get('prio') };
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
    const final = { barra: window.location.search, routerSearch: r.loc().search, useSearchParams: Object.fromEntries(r.sp()) };
    console.log('A1-B1 ' + JSON.stringify({ mount, apos, final }));
    expect(window.location.search).toContain('prio=high');
    expect(r.sp().get('prio')).toBeNull();     // o app inteiro (via useSearchParams) nao ve o filtro
  });

  it('B2 parametro escrito na barra por outro modulo e perdido na proxima mudanca de filtro', () => {
    const r = renderComRouter('/?view=tasks');
    act(() => { r.result.current.setPrio('high'); });
    const comPrio = window.location.search;
    // outro modulo da app escreve direto na barra (padrao do repo: CallSessionProvider,
    // setViewParam, ExternalProductManagement usam window.history.* cru)
    window.history.replaceState(null, '', '/?view=tasks&prio=high&task=abc123');
    const antes = window.location.search;
    act(() => { r.result.current.toggleAlarm(); });
    const depois = window.location.search;
    console.log('A1-B2 ' + JSON.stringify({ comPrio, barraComTask: antes, depoisDoToggle: depois, taskSobreviveu: new URLSearchParams(depois).get('task') }));
    expect(new URLSearchParams(depois).get('task')).toBeNull();
  });

  it('B3 navegacao do router para ?view=board (o que useSearchParams geraria) destroi os filtros', () => {
    const r = renderComRouter('/');
    act(() => { r.result.current.setSearch('liga'); });
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
    const comFiltro = snap(r);
    const visaoDoApp = Object.fromEntries(r.sp());        // o que o app "acha" que esta na URL
    act(() => { r.ir('/?view=board'); });                  // link montado a partir da visao do app
    const final = snap(r);
    console.log('A1-B3 ' + JSON.stringify({ comFiltro, visaoDoApp, final, barra: window.location.search }));
    expect(final.filters.q).toBe('');
    expect(final.texto).toBe('');
  });

  it('B4 navegar para a MESMA search: a URL e reescrita pelo efeito?', () => {
    const r = renderComRouter('/');
    act(() => { r.result.current.setPrio('high'); });
    const antes = window.location.search;
    act(() => { r.ir('/'); });
    const dentroDoAct = window.location.search;
    const depoisDoAct = window.location.search;
    const router = r.loc().search;
    console.log('A1-B4 ' + JSON.stringify({ antes, dentroDoAct, depoisDoAct, routerSearch: router, estado: snap(r) }));
    expect(true).toBe(true);
  });

  it('B4b filtro -> navegacao para raiz -> proxima mexida: a URL volta a ter o filtro?', () => {
    const r = renderComRouter('/');
    act(() => { r.result.current.setPrio('high'); });
    act(() => { r.ir('/'); });
    const aposNavigate = { barra: window.location.search, router: r.loc().search, prio: r.result.current.filters.prio, vePeloApp: r.sp().get('prio') };
    act(() => { r.result.current.toggleAlarm(); });
    const aposTocar = { barra: window.location.search, router: r.loc().search, prio: r.result.current.filters.prio };
    console.log('A1-B4b ' + JSON.stringify({ aposNavigate, aposTocar }));
    expect(true).toBe(true);
  });

  it('B5 nenhuma mudanca de filtro empilha historico nem dispara popstate', () => {
    const r = renderComRouter('/?view=tasks');
    let pops = 0;
    const conta = () => { pops += 1; };
    window.addEventListener('popstate', conta);
    const hist0 = window.history.length;
    act(() => { r.result.current.setPrio('high'); });
    act(() => { r.result.current.toggleAlarm(); });
    act(() => { r.result.current.toggleDone(); });
    act(() => { r.result.current.setContact('c1'); });
    act(() => { r.result.current.setSearch('liga'); });
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2); });
    act(() => { r.result.current.clear(); });
    const hist1 = window.history.length;
    console.log('A1-B5 ' + JSON.stringify({ hist0, hist1, pops, barra: window.location.search, url: window.location.href }));
    window.removeEventListener('popstate', conta);
    expect(hist1).toBe(hist0);
    expect(pops).toBe(0);
  });

  it('B6 deep-link depois de montar + filtro digitado antes: quem sobrevive', () => {
    const r = renderComRouter('/');
    act(() => { r.result.current.setSearch('ligacao'); });
    const digitado = snap(r);
    act(() => { r.ir('/?q=cafe&done=0'); });
    const reidratado = snap(r);
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2); });
    const final = snap(r);
    console.log('A1-B6 ' + JSON.stringify({ digitado, reidratado, final }));
    expect(final.filters).toEqual({ q: 'cafe', prio: 'all', contact: null, alarm: false, done: false });
  });

  it('B7 back depois de filtrar (replaceState nao deixa rastro do filtro)', () => {
    window.history.replaceState(null, '', '/pagina-anterior');
    const r = renderComRouter('/?view=tasks');
    act(() => { r.result.current.setPrio('high'); });
    const comFiltro = { barra: window.location.search, router: r.loc().search };
    act(() => { window.history.back(); });
    const aposBack = { href: window.location.href, router: r.loc().search, filtros: r.result.current.filters };
    console.log('A1-B7 ' + JSON.stringify({ comFiltro, aposBack }));
    expect(true).toBe(true);
  });
});
