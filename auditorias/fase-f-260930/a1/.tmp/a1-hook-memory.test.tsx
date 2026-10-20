/* A1 — sondas do hook useTasksFilters (MemoryRouter). Mede e imprime; nao corrige. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useNavigate, useLocation } from 'react-router-dom';
import React, { type ReactNode } from 'react';
import { useTasksFilters, SEARCH_DEBOUNCE_MS } from '@/hooks/tasks/useTasksFilters';

function wrapper(search = '') {
  return ({ children }: { children: ReactNode }) =>
    React.createElement(MemoryRouter, { initialEntries: [`/${search}`] }, children);
}

function renderFiltros(search = '') {
  return renderHook(() => useTasksFilters(), { wrapper: wrapper(search) });
}

/** Router + navegador espião + leitor do location do ROUTER. */
function renderComRouter(search = '') {
  let ir: (to: string | number) => void = () => {};
  let locRouter = '';
  const Espiao = () => {
    ir = useNavigate();
    locRouter = useLocation().search;
    return null;
  };
  const r = renderHook(() => useTasksFilters(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[`/${search}`]}>
        <Espiao />
        {children}
      </MemoryRouter>
    ),
  });
  return { ...r, ir: (to: string | number) => ir(to), locRouter: () => locRouter };
}

let est = 0;
function estado(result: { current: ReturnType<typeof useTasksFilters> }) {
  return {
    id: ++est,
    filters: result.current.filters,
    textoDaBusca: result.current.textoDaBusca,
    isActive: result.current.isActive,
    urlWindow: window.location.search,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState(null, '', '/');
  est = 0;
});

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});

describe('A1 — debounce', () => {
  it('M1 debounce + outro filtro antes dos 200ms', () => {
    const r = renderFiltros();
    act(() => { r.result.current.setSearch('liga'); });
    const a = estado(r.result);
    act(() => { r.result.current.setPrio('high'); });
    const b = estado(r.result);
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2); });
    const c = estado(r.result);
    console.log('A1-M1 ' + JSON.stringify({ aposDigitar: a, timersAntesDoPrio: 'n/a', aposPrio: b, aposDebounce: c }));
    expect(c.filters.q).toBe('');            // <-- a busca digitada NAO foi aplicada
    expect(c.textoDaBusca).toBe('liga');     // <-- mas o campo mostra o texto
  });

  it('M1b variantes: contact / alarm / done', () => {
    for (const [nome, acao] of [
      ['contact', (h: ReturnType<typeof useTasksFilters>) => h.setContact('c1')],
      ['alarm', (h: ReturnType<typeof useTasksFilters>) => h.toggleAlarm()],
      ['done', (h: ReturnType<typeof useTasksFilters>) => h.toggleDone()],
    ] as const) {
      const r = renderFiltros();
      act(() => { r.result.current.setSearch('liga'); });
      act(() => { acao(r.result.current); });
      act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2); });
      console.log('A1-M1b ' + JSON.stringify({ via: nome, ...estado(r.result) }));
    }
    expect(true).toBe(true);
  });

  it('M2 clear cancela o timer pendente', () => {
    const r = renderFiltros();
    act(() => { r.result.current.setSearch('liga'); });
    const timersComDebounce = vi.getTimerCount();
    act(() => { r.result.current.clear(); });
    const timersAposClear = vi.getTimerCount();
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 3); });
    console.log('A1-M2 ' + JSON.stringify({ timersComDebounce, timersAposClear, timersFinal: vi.getTimerCount(), ...estado(r.result) }));
    expect(timersAposClear).toBe(0);
    expect(r.result.current.filters.q).toBe('');
  });

  it('M2b clear + digitar + desmontar: sobra timer vivo?', () => {
    const r = renderFiltros('?q=liga');
    act(() => { r.result.current.setSearch('cafe'); });
    act(() => { r.result.current.clear(); });
    const t1 = vi.getTimerCount();
    act(() => { r.result.current.setSearch('orçamento'); });
    const t2 = vi.getTimerCount();
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2); });
    const t3 = vi.getTimerCount();
    const depois = estado(r.result);
    console.log('A1-M2b ' + JSON.stringify({ timersAposClear: t1, timersAposSegundoDigitar: t2, timersAposAvancar: t3, ...depois }));
    expect(t3).toBe(0);
    expect(depois.filters.q).toBe('orçamento');
  });

  it('M5 desmontar com debounce pendente', () => {
    const r = renderFiltros();
    act(() => { r.result.current.setSearch('liga'); });
    const antes = vi.getTimerCount();
    r.unmount();
    const depois = vi.getTimerCount();
    console.log('A1-M5 ' + JSON.stringify({ timersAntesDeDesmontar: antes, timersDepoisDeDesmontar: depois }));
    expect(depois).toBe(0);
  });

  it('M1c o timer que "perdeu" fica com id morto na ref (clear depois nao quebra)', () => {
    const r = renderFiltros();
    act(() => { r.result.current.setSearch('liga'); });
    act(() => { r.result.current.setPrio('high'); });
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2); });
    const t = vi.getTimerCount();
    act(() => { r.result.current.clear(); });
    console.log('A1-M1c ' + JSON.stringify({ timersAposDebouncePerdido: t, timersAposClear: vi.getTimerCount(), ...estado(r.result) }));
    expect(t).toBe(0);
  });
});

describe('A1 — reidratacao pelo router', () => {
  it('M6 navegacao dupla A->B: o ultimo vence', () => {
    const r = renderComRouter('/');
    act(() => { r.ir('/?q=um&prio=low'); });
    const a = estado(r.result);
    act(() => { r.ir('/?q=dois&prio=urgent'); });
    const b = estado(r.result);
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
    const c = estado(r.result);
    console.log('A1-M6 ' + JSON.stringify({ a, b, c }));
    expect(b.filters).toEqual({ q: 'dois', prio: 'urgent', contact: null, alarm: false, done: true });
  });

  it('M7 navegar para a MESMA search nao reidrata (mesmo com estado divergente)', () => {
    const r = renderComRouter('/');
    act(() => { r.result.current.setPrio('urgent'); });
    const aposPrio = estado(r.result);
    const routerAntes = r.locRouter();
    act(() => { r.ir('/'); });
    const aposVoltarParaRaiz = estado(r.result);
    const routerDepois = r.locRouter();
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
    console.log('A1-M7 ' + JSON.stringify({
      aposPrio, routerVistoPeloRouter: routerAntes, aposNavegarParaRaiz: aposVoltarParaRaiz,
      routerDepois, filtroSobreviveu: aposVoltarParaRaiz.filters.prio,
    }));
    expect(aposVoltarParaRaiz.filters.prio).toBe('urgent');
  });

  it('M8 navegacao durante debounce pendente: URL vence?', () => {
    const r = renderComRouter('/');
    act(() => { r.result.current.setSearch('liga'); });
    const depoisDeDigitar = estado(r.result);
    act(() => { r.ir('/?prio=high'); });
    const aposNavegar = estado(r.result);
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2); });
    const final = estado(r.result);
    console.log('A1-M8 ' + JSON.stringify({ depoisDeDigitar, aposNavegar, final }));
    expect(final.textoDaBusca).toBe('');
  });

  it('M9 voltar/avancar (ir(-1) / ir(1))', () => {
    const r = renderComRouter('/');
    act(() => { r.ir('/?q=um'); });
    act(() => { r.ir('/?q=dois'); });
    const comDois = estado(r.result);
    act(() => { r.ir(-1); });
    const voltou = estado(r.result);
    act(() => { r.ir(1); });
    const avancou = estado(r.result);
    console.log('A1-M9 ' + JSON.stringify({ comDois, voltou, avancou, router: r.locRouter() }));
    expect(voltou.filters.q).toBe('um');
  });

  it('M10 conta renders por navegacao (loop?)', () => {
    let renders = 0;
    let ir: (to: string | number) => void = () => {};
    const Espiao = () => { ir = useNavigate(); return null; };
    const { result } = renderHook(() => { renders += 1; return useTasksFilters(); }, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={['/']}><Espiao />{children}</MemoryRouter>
      ),
    });
    const base = renders;
    act(() => { ir('/?q=liga&prio=high&alarm=1&done=0'); });
    const aposNavegar = renders;
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 3); });
    const aposTempo = renders;
    console.log('A1-M10 ' + JSON.stringify({ rendersMontagem: base, rendersAposNavegar: aposNavegar, rendersAposTempo: aposTempo, delta: aposNavegar - base, resultou: result.current.filters }));
    expect(aposNavegar - base).toBeLessThan(6);
  });

  it('M11 trocar filtro nao move o router e nao muda o location do router', () => {
    const r = renderComRouter('/');
    const antes = { router: r.locRouter(), window: window.location.search };
    act(() => { r.result.current.setPrio('high'); });
    const depois = { router: r.locRouter(), window: window.location.search };
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
    console.log('A1-M11 ' + JSON.stringify({ antes, depois }));
    expect(antes.router).toBe(depois.router);          // router nunca soube
    expect(depois.window).not.toBe(antes.window);      // mas a URL real mudou
  });
});

describe('A1 — URL / historico', () => {
  it('M12 replaceState preserva view/task e nao empilha historico', () => {
    const r = renderFiltros('?view=board&task=abc');
    const hist0 = window.history.length;
    act(() => { r.result.current.setPrio('high'); });
    const hist1 = window.history.length;

    act(() => { r.result.current.toggleAlarm(); });
    act(() => { r.result.current.toggleDone(); });
    act(() => { r.result.current.setContact('c1'); });
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
    const hist2 = window.history.length;
    console.log('A1-M12 ' + JSON.stringify({ hist0, hist1, hist2, url: window.location.search, params: Object.fromEntries(new URLSearchParams(window.location.search)) }));
    expect(window.location.search).toContain('view=board');
    expect(window.location.search).toContain('task=abc');
    expect(hist2).toBe(hist0);
  });

  it('M13 clear() com view/task na URL', () => {
    const r = renderFiltros('?view=board&task=abc&q=liga&prio=high');
    act(() => { r.result.current.clear(); });
    console.log('A1-M13 ' + JSON.stringify({ url: window.location.search, filtros: r.result.current.filters, texto: r.result.current.textoDaBusca }));
    expect(window.location.search).toBe('?view=board&task=abc');
  });

  it('M14 zero requests novos quando o filtro muda', () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchSpy);
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open');

    const r = renderFiltros('?view=board');
    act(() => { r.result.current.setPrio('high'); });
    act(() => { r.result.current.toggleAlarm(); });
    act(() => { r.result.current.toggleDone(); });
    act(() => { r.result.current.setContact('c1'); });
    act(() => { r.result.current.setSearch('liga'); });
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2); });
    act(() => { r.result.current.clear(); });

    console.log('A1-M14 ' + JSON.stringify({ fetch: fetchSpy.mock.calls.length, xhrOpen: xhrOpen.mock.calls.length, url: window.location.search }));
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    xhrOpen.mockRestore();
  });
});
