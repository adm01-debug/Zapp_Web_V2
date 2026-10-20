import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { GeoSuggestion, GeoSearchPlace } from '@/lib/mapboxGeocode';

const h = vi.hoisted(() => ({
  suggestPlaces: vi.fn(),
  retrievePlaceResult: vi.fn(),
  searchPlaces: vi.fn(),
  getCachedSuggest: vi.fn(),
  reportMapboxFailure: vi.fn(),
  getSearchSession: vi.fn(),
  peekSearchSession: vi.fn(),
  noteSuggestCall: vi.fn(),
  noteRetrieveCall: vi.fn(),
  endSearchSession: vi.fn(),
  isSearchBudgetOk: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/mapboxGeocode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mapboxGeocode')>();
  return {
    ...actual,
    suggestPlaces: (...args: unknown[]) => h.suggestPlaces(...args),
    // F2/E18: o hook usa a versão com causa — sem mockar, o teste cairia na implementação real.
    retrievePlaceResult: (...args: unknown[]) => h.retrievePlaceResult(...args),
    // F2/E15: o fallback do /suggest é o /forward — precisa de mock para o teste controlar a rota.
    searchPlaces: (...args: unknown[]) => h.searchPlaces(...args),
    // E45: o hook confere o cache ANTES de abrir sessão — o teste controla o que está cacheado.
    getCachedSuggest: (...args: unknown[]) => h.getCachedSuggest(...args),
  };
});
vi.mock('@/lib/mapboxToken', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mapboxToken')>();
  return { ...actual, reportMapboxFailure: (...args: unknown[]) => h.reportMapboxFailure(...args) };
});
vi.mock('@/lib/mapboxSession', () => ({
  getSearchSession: () => h.getSearchSession(),
  peekSearchSession: () => h.peekSearchSession(),
  noteSuggestCall: () => h.noteSuggestCall(),
  noteRetrieveCall: () => h.noteRetrieveCall(),
  endSearchSession: () => h.endSearchSession(),
}));
vi.mock('@/lib/mapboxCostGuard', () => ({
  isSearchBudgetOk: () => h.isSearchBudgetOk(),
}));
vi.mock('@/lib/audit', () => ({ logAudit: (...args: unknown[]) => h.logAudit(...args) }));

import { useAddressAutocomplete } from '../useAddressAutocomplete';

const suggestionA: GeoSuggestion = { id: 'a', name: 'Rua A', address: 'Rua A, São Paulo', kind: 'street' };
const suggestionB: GeoSuggestion = { id: 'b', name: 'Rua B', address: 'Rua B, São Paulo', kind: 'street' };
const suggestionC: GeoSuggestion = { id: 'c', name: 'Rua C', address: 'Rua C, São Paulo', kind: 'street' };
// E50: sugestão vinda do `/forward` (já tem coordenada) — a seleção não passa pelo `/retrieve`,
// mas continua registrando o evento, com `source: 'forward'` e o `kind` da própria sugestão.
const suggestionPoiForward: GeoSuggestion = { id: 'f', name: 'Rua A', address: 'Rua A, 1, São Paulo', kind: 'poi', coords: { lat: -23.5, lng: -46.6 } };
// Coordenadas que o `/forward` devolveria nos casos de cascata (F2/E15/E16/E17).
const forwardPaulista: GeoSearchPlace = { name: 'Avenida Paulista', address: 'Av. Paulista, 1000 - Bela Vista, São Paulo', lat: -23.5613, lng: -46.6565 };
const forwardA: GeoSearchPlace = { name: 'Rua A', address: 'Rua A, 1, São Paulo', lat: -23.5, lng: -46.6 };
const forwardB: GeoSearchPlace = { name: 'Rua B', address: 'Rua B, 200, São Paulo', lat: -23.5, lng: -46.6 };
const forwardC: GeoSearchPlace = { name: 'Rua C', address: 'Rua C, 3', lat: -23.5, lng: -46.6 };

type KeyDownEvent = Parameters<ReturnType<typeof useAddressAutocomplete>['onKeyDown']>[0];

function fakeKeyEvent(key: string): KeyDownEvent {
  return { key, preventDefault: vi.fn() } as unknown as KeyDownEvent;
}

describe('useAddressAutocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.suggestPlaces.mockReset();
    h.retrievePlaceResult.mockReset();
    // Padrão do /forward nos testes: falhou também — é o cenário "as duas rotas caíram", que
    // mantém o comportamento antigo (erro exposto) nos testes que não falam de fallback.
    h.searchPlaces.mockReset().mockResolvedValue({ ok: false, kind: 'not_found' });
    h.reportMapboxFailure.mockReset();
    // E45: por padrão não há sessão espiada nem termo em cache — o fluxo segue o caminho da rede,
    // que é o que os testes anteriores a esta etapa exercitam.
    h.getCachedSuggest.mockReset().mockReturnValue(undefined);
    h.peekSearchSession.mockReset().mockReturnValue(null);
    h.getSearchSession.mockReset().mockReturnValue('session-1');
    h.noteSuggestCall.mockReset();
    h.noteRetrieveCall.mockReset();
    h.endSearchSession.mockReset();
    h.isSearchBudgetOk.mockReset().mockReturnValue(true);
    // E50: a contagem de eventos é parte da prova (1× por seleção) — não pode acumular entre casos.
    h.logAudit.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = (overrides?: Partial<Parameters<typeof useAddressAutocomplete>[0]>) =>
    renderHook(() => useAddressAutocomplete({ token: 'tok', enabled: true, ...overrides }));

  // F2: digita o termo, deixa o debounce correr e seleciona o 1º item — o fluxo que todos os
  // casos de cascata repetem (digitar → esperar → selecionar) fica num lugar só.
  async function typeAndSelectFirst(term: string) {
    const { result } = setup();
    act(() => { result.current.setQuery(term); });
    await act(async () => { vi.advanceTimersByTime(300); });
    const places: Array<GeoSearchPlace | null> = [];
    await act(async () => { places.push(await result.current.select(0)); });
    return { result, place: places[0] ?? null };
  }

  // E45 · A sessão nasce no primeiro request REAL. Termo que já está em cache é servido sem abrir
  // sessão e sem contar `/suggest`: repetir um termo (ou voltar a um já buscado) gerava sessão de
  // billing e evento de audit para um request que nunca saiu — custo e sessões medidos inflados.
  describe('E45 — sessão só nasce no primeiro request real', () => {
    it('mesmo termo 2×: o 2º sai do cache, sem sessão nova e sem contar /suggest', async () => {
      // A rede devolve C; o cache de "Rua A" tem A — assim dá para provar de onde veio o resultado.
      h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionC] });
      const { result } = setup();
      act(() => { result.current.setQuery('Rua A'); });
      await act(async () => { vi.advanceTimersByTime(300); });
      expect(h.getSearchSession).toHaveBeenCalledTimes(1);
      expect(h.suggestPlaces).toHaveBeenCalledTimes(1);
      expect(h.noteSuggestCall).toHaveBeenCalledTimes(1);

      // A sessão segue viva e "Rua A" fica em cache (só ele; qualquer outro termo vai à rede).
      h.peekSearchSession.mockReturnValue('session-1');
      h.getCachedSuggest.mockImplementation((_s: string, t: string) =>
        t === 'Rua A' ? [suggestionA] : undefined,
      );

      // Digitar outro termo e VOLTAR ao primeiro é o caso real (setQuery com o mesmo valor não
      // re-renderiza no React, então o teste precisa passar por um termo diferente).
      act(() => { result.current.setQuery('Rua B'); });
      await act(async () => { vi.advanceTimersByTime(300); });
      expect(h.getSearchSession).toHaveBeenCalledTimes(2);
      expect(result.current.suggestions).toEqual([suggestionC]);

      act(() => { result.current.setQuery('Rua A'); });
      await act(async () => { vi.advanceTimersByTime(300); });

      expect(h.getCachedSuggest).toHaveBeenCalledWith('session-1', 'Rua A');
      expect(h.getSearchSession).toHaveBeenCalledTimes(2); // termo cacheado: nenhuma sessão nova
      expect(h.noteSuggestCall).toHaveBeenCalledTimes(2); // nem /suggest contado a mais
      expect(h.suggestPlaces).toHaveBeenCalledTimes(2); // e nada saiu para a rede
      expect(result.current.suggestions).toEqual([suggestionA]); // veio do cache, não da rede
    });

    it('termo em cache com sessão vencida: 0 sessões novas (peek não renova)', async () => {
      h.peekSearchSession.mockReturnValue('session-velha');
      h.getCachedSuggest.mockReturnValue([suggestionB]);
      const { result } = setup();
      act(() => { result.current.setQuery('Rua B'); });
      await act(async () => { vi.advanceTimersByTime(300); });

      expect(h.getSearchSession).not.toHaveBeenCalled();
      expect(h.noteSuggestCall).not.toHaveBeenCalled();
      expect(h.suggestPlaces).not.toHaveBeenCalled();
      expect(result.current.suggestions).toEqual([suggestionB]);
    });

    it('E50: seleção via /retrieve registra {source, kind} — 1× e sem termo/endereço/coordenada', async () => {
      // O evento responde: a escolha veio da sessão do Searchbox (paga) ou da rede de proteção
      // `/forward`? E o `kind` diz QUE tipo de lugar foi escolhido (rua, endereço, POI). Termo
      // digitado, nome, endereço e coordenada NÃO entram no evento (spec E50, item 2).
      h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionC] });
      h.retrievePlaceResult.mockResolvedValue({
        ok: true,
        place: { lat: -23.5613, lng: -46.6565, name: 'Avenida Paulista', address: 'Av. Paulista, São Paulo' },
      });
      const { result } = setup();
      act(() => { result.current.setQuery('Rua A'); });
      await act(async () => { vi.advanceTimersByTime(300); });

      await act(async () => { await result.current.select(0); });

      // 1× por `/retrieve` bem-sucedido — não duplica.
      expect(h.logAudit).toHaveBeenCalledTimes(1);
      const evento = h.logAudit.mock.calls[0][0];
      expect(evento).toMatchObject({
        action: 'searchbox_selected',
        details: { source: 'suggest', kind: 'street' },
      });
      // Shape fechado: SÓ {source, kind} — nada de position nem campo extra.
      expect(Object.keys(evento.details).sort()).toEqual(['kind', 'source']);
      const json = JSON.stringify(evento.details);
      expect(json).not.toContain('Rua');
      expect(json).not.toContain('Paulista');
      expect(json).not.toContain('-23.5');
    });

    it('E50: sugestão do /forward (já com coords) registra source forward e o kind da sugestão', async () => {
      h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionPoiForward] });
      const { result } = setup();
      act(() => { result.current.setQuery('Rua A'); });
      await act(async () => { vi.advanceTimersByTime(300); });

      await act(async () => { await result.current.select(0); });

      // Não passa pelo `/retrieve`, mas o evento sai com a origem e o tipo certos.
      expect(h.retrievePlaceResult).not.toHaveBeenCalled();
      expect(h.logAudit).toHaveBeenCalledTimes(1);
      const evento = h.logAudit.mock.calls[0][0];
      expect(evento).toMatchObject({
        action: 'searchbox_selected',
        details: { source: 'forward', kind: 'poi' },
      });
      const json = JSON.stringify(evento.details);
      expect(json).not.toContain('Rua');
      expect(json).not.toContain('-23.5');
    });
    
    it('lista vazia cacheada (E19) também é servida sem sessão nova', async () => {
      h.peekSearchSession.mockReturnValue('session-1');
      h.getCachedSuggest.mockReturnValue([]);
      const { result } = setup();
      act(() => { result.current.setQuery('Rua Z'); });
      await act(async () => { vi.advanceTimersByTime(300); });

      expect(h.getSearchSession).not.toHaveBeenCalled();
      expect(h.suggestPlaces).not.toHaveBeenCalled();
      expect(result.current.suggestions).toEqual([]);
      expect(result.current.status).toBe('empty');
    });
  });

  // E27 · Estado `paused` (429 / teto de custo) com aviso único, sem esqueleto e sem "Falha".
  // O guard de 429 e o de custo existiam, mas o caminho principal saía CALADO: a tela ficava num
  // esqueleto que nunca sai (ou num "Nada encontrado" que é mentira), e o operador não sabia que a
  // espera era proposital. Aqui se mede o estado, não a intenção.
  describe('E27 — pausa visível ao operador', () => {
    it('429 deixa a tela em pausa com motivo, sem esqueleto e sem erro de falha', async () => {
      h.suggestPlaces.mockResolvedValue({ ok: false, kind: 'rate_limited' });
      const { result } = setup();
      act(() => { result.current.setQuery('rua a'); });
      await act(async () => { vi.advanceTimersByTime(300); });

      expect(result.current.status).toBe('paused');
      expect(result.current.blocked).toBe('rate_limited');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.suggestions).toEqual([]);
    });

    it('teto de custo do mês pausa com motivo cost_guard e nem chama a rede', async () => {
      h.isSearchBudgetOk.mockReturnValue(false);
      const { result } = setup();
      act(() => { result.current.setQuery('rua a'); });
      await act(async () => { vi.advanceTimersByTime(300); });

      expect(result.current.status).toBe('paused');
      expect(result.current.blocked).toBe('cost_guard');
      expect(result.current.isLoading).toBe(false);
      expect(h.suggestPlaces).not.toHaveBeenCalled();
    });

    it('digitar mais durante a pausa não apaga o aviso nem re-requesta', async () => {
      h.suggestPlaces.mockResolvedValue({ ok: false, kind: 'rate_limited' });
      const { result } = setup();
      act(() => { result.current.setQuery('rua a'); });
      await act(async () => { vi.advanceTimersByTime(300); });
      expect(result.current.status).toBe('paused');

      act(() => { result.current.setQuery('rua ab'); });
      await act(async () => { vi.advanceTimersByTime(300); });

      expect(result.current.status).toBe('paused');
      expect(result.current.blocked).toBe('rate_limited');
      expect(h.suggestPlaces).toHaveBeenCalledTimes(1); // backoff anti-hammering segura
    });

    it('Enter continua ativo na pausa: o hook não engole a tecla (quem usa cai no /forward)', async () => {
      h.suggestPlaces.mockResolvedValue({ ok: false, kind: 'rate_limited' });
      const { result } = setup();
      act(() => { result.current.setQuery('rua a'); });
      await act(async () => { vi.advanceTimersByTime(300); });
      expect(result.current.status).toBe('paused');

      const enter = fakeKeyEvent('Enter');
      act(() => { result.current.onKeyDown(enter); });

      // Na pausa não há item destacado, então o hook não chama preventDefault: a tecla segue para
      // a busca do consumidor (/forward, F2) — é o que garante "o operador nunca fica sem busca".
      expect(enter.preventDefault).not.toHaveBeenCalled();
      expect(h.retrievePlaceResult).not.toHaveBeenCalled(); // nada de /retrieve sem seleção
      expect(result.current.status).toBe('paused'); // e a pausa continua de pé
    });
  });

  // E54 · 429 não vem só do `/suggest`: `/retrieve` e `/forward` são endpoints da Mapbox e também
  // devolvem 429. Antes só o `/suggest` ligava o backoff — o 429 do `/forward` morria como falha de
  // rota (a cascata seguia) e o do `/retrieve` ficava preso ao item, então a próxima tecla
  // martelava uma API que já tinha dito "espere".
  describe('E54 — 429 do /retrieve e do /forward também pausam', () => {
    it('/forward com 429 liga o backoff de 60 s', async () => {
      // `/suggest` caiu por ROTA (não é limite): quem assume é o /forward — que responde 429.
      h.suggestPlaces.mockResolvedValue({ ok: false, kind: 'http' });
      h.searchPlaces.mockResolvedValue({ ok: false, kind: 'rate_limited' });
      const { result } = setup();
      act(() => { result.current.setQuery('rua a'); });
      await act(async () => { vi.advanceTimersByTime(300); });

      expect(result.current.status).toBe('paused');
      expect(result.current.blocked).toBe('rate_limited');
      expect(result.current.pausedUntil).not.toBeNull();
    });

    it('/retrieve com 429 liga o backoff de 60 s', async () => {
      h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
      h.retrievePlaceResult.mockResolvedValue({ ok: false, kind: 'rate_limited' });
      const { result } = setup();
      act(() => { result.current.setQuery('rua a'); });
      await act(async () => { vi.advanceTimersByTime(300); });
      await act(async () => { await result.current.select(0); });

      expect(result.current.status).toBe('paused');
      expect(result.current.blocked).toBe('rate_limited');
      expect(result.current.pausedUntil).not.toBeNull();
    });
  });

  it('não faz nenhuma chamada enquanto enabled=false', async () => {
    const { result } = setup({ enabled: false });
    act(() => { result.current.setQuery('rua augusta'); });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(h.suggestPlaces).not.toHaveBeenCalled();
  });

  it('não dispara com menos de 3 caracteres', async () => {
    const { result } = setup();
    act(() => { result.current.setQuery('ab'); });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(h.suggestPlaces).not.toHaveBeenCalled();
  });

  it('300ms de debounce: 10 teclas rápidas geram 1 request', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [] });
    const { result } = setup();
    const keys = 'abcdefghij';
    let term = '';
    for (const c of keys) {
      term += c;
      act(() => { result.current.setQuery(term); });
      act(() => { vi.advanceTimersByTime(50); });
    }
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(h.suggestPlaces).toHaveBeenCalledTimes(1);
    expect(h.suggestPlaces).toHaveBeenCalledWith('abcdefghij', 'tok', expect.objectContaining({ session: 'session-1' }));
  });

  it('E80: 200 teclas em 5 s (25 ms cada) -> <= 17 requests e 1 sessao', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [] });
    const { result } = setup();
    let term = '';
    // 200 teclas x 25 ms = 5000 ms de digitacao continua.
    for (let i = 0; i < 200; i++) {
      term += String.fromCharCode(97 + (i % 26));
      act(() => { result.current.setQuery(term); });
      act(() => { vi.advanceTimersByTime(25); });
    }
    await act(async () => { vi.advanceTimersByTime(300); });
    const requests = h.suggestPlaces.mock.calls.length;
    const sessoes = new Set(h.suggestPlaces.mock.calls.map((c) => (c[2] as { session?: string })?.session));
    // O teto da E80 e <= 17 (1 a cada 300 ms); o medido e reportado no PR.
    expect(requests).toBeLessThanOrEqual(17);
    expect(sessoes.size).toBe(1);
  });

  it('cancela a consulta anterior — resposta lenta da 1ª não sobrescreve a 2ª', async () => {
    let resolveFirst: (value: { ok: true; suggestions: GeoSuggestion[] }) => void = () => {};
    const firstPromise = new Promise<{ ok: true; suggestions: GeoSuggestion[] }>((resolve) => { resolveFirst = resolve; });
    h.suggestPlaces
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(() => Promise.resolve({ ok: true, suggestions: [suggestionB] }));

    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });
    act(() => { result.current.setQuery('rua ab'); });
    await act(async () => { vi.advanceTimersByTime(300); });

    expect(result.current.suggestions).toEqual([suggestionB]);

    await act(async () => { resolveFirst({ ok: true, suggestions: [suggestionA] }); });
    expect(result.current.suggestions).toEqual([suggestionB]);
    expect(result.current.error).toBeNull();
  });

  it('select() chama retrievePlaceResult, devolve a coordenada e encerra a sessão', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
    h.retrievePlaceResult.mockResolvedValue({ ok: true, place: { address: 'Rua A, 1', lat: -23.5, lng: -46.6 } });
    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });

    let place;
    await act(async () => { place = await result.current.select(0); });

    expect(place).toEqual({ address: 'Rua A, 1', lat: -23.5, lng: -46.6 });
    expect(h.endSearchSession).toHaveBeenCalledTimes(1);
    expect(result.current.retrievingId).toBeNull();
  });

  it('falha do /retrieve não fecha a lista — sugestões continuam de pé', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
    h.retrievePlaceResult.mockResolvedValue({ ok: false, kind: 'not_found' });
    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });

    await act(async () => { await result.current.select(0); });

    expect(result.current.suggestions).toEqual([suggestionA]);
    // F3/E26: a falha do `/retrieve` não é erro da lista — ela fica presa ao item escolhido.
    expect(result.current.error).toBeNull();
    expect(result.current.retrieveError).toEqual({ id: 'a', kind: 'not_found' });
    expect(result.current.retrievingId).toBeNull();
  });

  it('teclado: ArrowDown/ArrowUp/Home/End navegam; Enter só previne o padrão (E46: quem usa decide chamar select) e Esc limpa e encerra a sessão', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA, suggestionB, suggestionC] });
    const { result } = setup();
    act(() => { result.current.setQuery('rua'); });
    await act(async () => { vi.advanceTimersByTime(300); });

    act(() => { result.current.onKeyDown(fakeKeyEvent('ArrowDown')); });
    expect(result.current.highlightedIndex).toBe(0);
    act(() => { result.current.onKeyDown(fakeKeyEvent('ArrowDown')); });
    expect(result.current.highlightedIndex).toBe(1);
    act(() => { result.current.onKeyDown(fakeKeyEvent('End')); });
    expect(result.current.highlightedIndex).toBe(2);
    act(() => { result.current.onKeyDown(fakeKeyEvent('Home')); });
    expect(result.current.highlightedIndex).toBe(0);

    // E46: o hook NÃO resolve a seleção sozinho no Enter — antes ele chamava select() aqui e
    // descartava o resultado (`void`), então quem usava o hook nunca sabia que uma seleção por
    // teclado tinha acontecido. Agora só previne o padrão do input.
    const preventDefault = vi.fn();
    act(() => { result.current.onKeyDown({ key: 'Enter', preventDefault } as unknown as KeyDownEvent); });
    expect(preventDefault).toHaveBeenCalled();
    expect(h.retrievePlaceResult).not.toHaveBeenCalled();

    act(() => { result.current.onKeyDown(fakeKeyEvent('Escape')); });
    expect(result.current.query).toBe('');
    expect(result.current.suggestions).toEqual([]);
    // E46: Escape também encerra a sessão — ver teste dedicado abaixo para o cenário completo.
    expect(h.endSearchSession).toHaveBeenCalledTimes(1);
  });

  it('E46: clear() (Escape ou fechar o picker) encerra a sessão — não deixa sessão aberta para a próxima busca', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });

    expect(h.endSearchSession).not.toHaveBeenCalled();
    act(() => { result.current.clear(); });
    expect(h.endSearchSession).toHaveBeenCalledTimes(1);
  });

  it('E46: seleção mais nova vence — resultado de uma seleção anterior em voo não sobrescreve a mais recente (sem AbortController no /retrieve)', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA, suggestionB] });
    let resolveFirst: (value: { ok: true; place: GeoSearchPlace }) => void = () => {};
    const firstRetrieve = new Promise<{ ok: true; place: GeoSearchPlace }>((resolve) => { resolveFirst = resolve; });
    h.retrievePlaceResult
      .mockImplementationOnce(() => firstRetrieve)
      .mockImplementationOnce(() => Promise.resolve({ ok: true, place: { address: 'Rua B, 2', lat: 2, lng: 2 } }));

    const { result } = setup();
    act(() => { result.current.setQuery('rua'); });
    await act(async () => { vi.advanceTimersByTime(300); });

    let placeA: GeoSearchPlace | null = null;
    let placeB: GeoSearchPlace | null = null;
    await act(async () => {
      const pendingA = result.current.select(0);
      const pendingB = result.current.select(1);
      resolveFirst({ ok: true, place: { address: 'Rua A, 1', lat: 1, lng: 1 } });
      placeA = await pendingA;
      placeB = await pendingB;
    });

    expect(placeA).toBeNull();
    expect(placeB).toEqual({ address: 'Rua B, 2', lat: 2, lng: 2 });
    expect(result.current.retrievingId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('Enter sem item destacado não chama select', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
    const { result } = setup();
    act(() => { result.current.setQuery('rua'); });
    await act(async () => { vi.advanceTimersByTime(300); });

    act(() => { result.current.onKeyDown(fakeKeyEvent('Enter')); });
    expect(h.retrievePlaceResult).not.toHaveBeenCalled();
  });

  it('lista vazia sem erro quando /suggest devolve 0 sugestões', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [] });
    const { result } = setup();
    act(() => { result.current.setQuery('xyz'); });
    await act(async () => { vi.advanceTimersByTime(300); });

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('erro de rede expõe o GeoFailureKind real e isLoading sempre resolve', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: false, kind: 'network' });
    const { result } = setup();
    act(() => { result.current.setQuery('xyz'); });
    await act(async () => { vi.advanceTimersByTime(300); });

    expect(result.current.error).toBe('network');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.suggestions).toEqual([]);
  });

  it('E37: guarda de custo — mês estourou o teto, não chama suggestPlaces nem abre sessão', async () => {
    h.isSearchBudgetOk.mockReturnValue(false);
    const { result } = setup();
    act(() => { result.current.setQuery('rua augusta'); });
    await act(async () => { vi.advanceTimersByTime(300); });

    expect(h.suggestPlaces).not.toHaveBeenCalled();
    expect(h.getSearchSession).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it('E38: 429 ativa backoff de 60s — não tenta de novo a cada tecla dentro da janela', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: false, kind: 'rate_limited' });
    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });

    expect(h.suggestPlaces).toHaveBeenCalledTimes(1);
    // E27: o 429 entra em PAUSA (aviso fixo com prazo), não em estado de erro — o motivo vive em
    // `blocked`. O que este teste protege continua igual: não re-requestar dentro da janela.
    expect(result.current.status).toBe('paused');
    expect(result.current.blocked).toBe('rate_limited');
    expect(result.current.error).toBeNull();

    act(() => { result.current.setQuery('rua ab'); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(h.suggestPlaces).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(60_000); });
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
    act(() => { result.current.setQuery('rua abc'); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(h.suggestPlaces).toHaveBeenCalledTimes(2);
  });

  it('A3-04: retry depois da espera ENCERRA a pausa (o aviso não fica preso em "0 s")', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: false, kind: 'rate_limited' });
    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });
    // E27: o 429 já entra em PAUSA (antes era 'error' com a mensagem de falha). O que o A3-04
    // protege é o que vem depois: "Tentar novamente" não faz request novo e a espera, ao passar,
    // TEM de tirar a tela da pausa (o aviso não fica preso em "0 s").
    expect(result.current.status).toBe('paused');
    expect(result.current.blocked).toBe('rate_limited');

    // "Tentar novamente" durante a espera mantém a pausa e não faz request novo (E13)
    act(() => { result.current.retrySuggest(); });
    expect(result.current.status).toBe('paused');
    expect(result.current.blocked).toBe('rate_limited');
    expect(result.current.pausedUntil).not.toBeNull();
    expect(h.suggestPlaces).toHaveBeenCalledTimes(1);

    // a espera passa; a partir daqui o retry tem de religar a busca e SAIR da pausa — era aqui
    // que ela ficava presa (o aviso seguia de pé, com o contador morto em "0 s")
    act(() => { vi.advanceTimersByTime(60_000); });
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
    act(() => { result.current.retrySuggest(); });
    await act(async () => {});

    expect(h.suggestPlaces).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('ok');
    expect(result.current.blocked).toBeNull();
    // A3-04 (gap fechado): o retry tem de zerar `pausedUntil` (rateLimitedUntil) — é ele que
    // alimenta o aviso "pausadas por X s". SUGGEST_SUCCESS não mexe em rateLimitedUntil, então só
    // o RETRY limpa de verdade; se ficar preso no timestamp expirado, a tela mostra o contador
    // morto em "0 s".
    expect(result.current.pausedUntil).toBeNull();
  });

  // ── Onda 2 · estado stale (A3-06) e backoff vs clear (E38) ──────────────────────────────────

  it('A3-06: digitar de novo invalida o destaque do termo anterior (Enter não aplica sugestão invisível)', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA, suggestionB] });
    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(result.current.suggestions).toHaveLength(2);

    // O operador navega com o teclado (destaque no 1º item)…
    act(() => { result.current.onKeyDown(fakeKeyEvent('ArrowDown')); });
    expect(result.current.highlightedIndex).toBe(0);

    // …e digita mais (>=3 chars). O destaque é do termo ANTERIOR: tem de cair, senão o Enter em
    // LocationPicker (highlightedIndex >= 0) aplicaria a sugestão invisível do termo antigo.
    act(() => { result.current.setQuery('rua augusta 100'); });
    expect(result.current.highlightedIndex).toBe(-1);
  });

  it('E38 (onda 2): clear() NÃO destrava o backoff de 429 — a proteção anti-hammering sobrevive ao Esc/fechar', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: false, kind: 'rate_limited' });
    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(result.current.pausedUntil).not.toBeNull();

    // O operador fecha/reabre o picker (clear) 1 s depois — bem dentro dos 60 s de backoff.
    act(() => { result.current.clear(); });
    act(() => { vi.advanceTimersByTime(1000); });
    h.suggestPlaces.mockClear();

    // A tecla seguinte não pode re-requestar em cima do 429.
    act(() => { result.current.setQuery('rua b'); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(h.suggestPlaces).not.toHaveBeenCalled();
  });

  // ── F2 · cascata /suggest → /forward (E15–E20) ──────────────────────────────────────────────

  it('E15: /suggest cai por rota (http) — o /forward assume e as sugestões já vêm com coordenada', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: false, kind: 'http' });
    h.searchPlaces.mockResolvedValue({ ok: true, places: [forwardPaulista] });
    const { result } = setup();
    act(() => { result.current.setQuery('avenida paulista'); });
    await act(async () => { vi.advanceTimersByTime(300); });

    // Sem o fallback, /suggest fora do ar = busca fora do ar (C3). O termo é o mesmo digitado.
    expect(h.searchPlaces).toHaveBeenCalledWith('avenida paulista', 'tok', expect.anything(), undefined);
    expect(result.current.suggestions).toEqual([
      expect.objectContaining({
        name: 'Avenida Paulista',
        address: 'Av. Paulista, 1000 - Bela Vista, São Paulo',
        coords: { lat: -23.5613, lng: -46.6565 },
      }),
    ]);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('E15: selecionar sugestão do /forward não chama /retrieve — a coordenada já veio junto', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: false, kind: 'timeout' });
    h.searchPlaces.mockResolvedValue({ ok: true, places: [forwardB] });

    const { place } = await typeAndSelectFirst('rua b');

    expect(h.retrievePlaceResult).not.toHaveBeenCalled();
    expect(place).toEqual(forwardB);
    // Sessão fechada de todo jeito — sessão fantasma é o defeito que o E46 fechou.
    expect(h.endSearchSession).toHaveBeenCalled();
  });

  it('E16: /retrieve sem coordenada — repete a busca com o texto da sugestão no /forward', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
    h.retrievePlaceResult.mockResolvedValue({ ok: false, kind: 'not_found' });
    h.searchPlaces.mockResolvedValue({ ok: true, places: [forwardA] });

    const { result, place } = await typeAndSelectFirst('rua a');

    // O termo do fallback é o nome + endereço da própria sugestão — o corte de relevância do
    // /forward é aplicado dentro de searchPlaces (MIN_V5_RELEVANCE).
    expect(h.searchPlaces).toHaveBeenCalledWith('Rua A Rua A, São Paulo', 'tok', undefined, undefined);
    expect(place).toEqual(forwardA);
    expect(result.current.error).toBeNull();
  });

  it('E17: telemetria só quando as DUAS rotas falham na mesma busca', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: false, kind: 'http' });
    h.searchPlaces.mockResolvedValue({ ok: true, places: [forwardC] });
    const { result } = setup();
    act(() => { result.current.setQuery('rua c'); });
    await act(async () => { vi.advanceTimersByTime(300); });
    // Fallback salvou a busca — não é falha, não vira client_error.
    expect(h.reportMapboxFailure).not.toHaveBeenCalled();
    expect(result.current.suggestions).toHaveLength(1);

    // Agora as duas caem: aí sim reporta uma vez, com a tradução da causa.
    h.searchPlaces.mockResolvedValue({ ok: false, kind: 'network' });
    act(() => { result.current.setQuery('rua cc'); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(h.reportMapboxFailure).toHaveBeenCalledTimes(1);
    expect(h.reportMapboxFailure).toHaveBeenCalledWith('server_error', 'suggest');
  });

  it('E51: /retrieve com causa de ROTA e /forward tambem falho reporta uma vez, com a causa do retrieve', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
    h.retrievePlaceResult.mockResolvedValue({ ok: false, kind: 'network' });
    h.searchPlaces.mockResolvedValue({ ok: false, kind: 'network' });
    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => { await result.current.select(0); });
    // dupla falha: nem /retrieve nem o /forward resolveram, e a causa e de rota (nao not_found)
    expect(h.reportMapboxFailure).toHaveBeenCalledWith('network', 'retrieve');
    expect(h.reportMapboxFailure).toHaveBeenCalledWith('network', 'retrieve');
  });

  it('E17/E51: /retrieve sem resultado com o /forward também vazio não gera client_error de rota', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
    h.retrievePlaceResult.mockResolvedValue({ ok: false, kind: 'not_found' });
    h.searchPlaces.mockResolvedValue({ ok: false, kind: 'not_found' });
    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });

    await act(async () => { await result.current.select(0); });

    expect(h.reportMapboxFailure).not.toHaveBeenCalled();
    // E26: sem coordenada e sem causa de rota, o que sobra é a falha do item — não um erro da lista.
    expect(result.current.error).toBeNull();
    expect(result.current.retrieveError).toEqual({ id: 'a', kind: 'not_found' });
  });

  // ── F2 · retry real (E13/E14) ───────────────────────────────────────────────────────────────

  it('E13: retrySuggest dispara na hora, sem esperar o debounce, e reusa o termo atual', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: false, kind: 'http' });
    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(h.suggestPlaces).toHaveBeenCalledTimes(1);

    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
    h.searchPlaces.mockResolvedValue({ ok: false, kind: 'not_found' });
    await act(async () => { result.current.retrySuggest(); });

    // Sem `advanceTimersByTime`: antes, o botão só resetava a query e dependia do debounce.
    expect(h.suggestPlaces).toHaveBeenCalledTimes(2);
    expect(h.suggestPlaces).toHaveBeenLastCalledWith('rua a', 'tok', expect.objectContaining({ session: 'session-1' }));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.suggestions).toEqual([suggestionA]);
  });

  it('E13: retrySuggest bloqueado pela guarda de custo não faz request e marca `blocked` (não "Nada encontrado")', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [] });
    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(h.suggestPlaces).toHaveBeenCalledTimes(1);

    h.isSearchBudgetOk.mockReturnValue(false);
    await act(async () => { result.current.retrySuggest(); });

    expect(h.suggestPlaces).toHaveBeenCalledTimes(1);
    expect(result.current.blocked).toBe('cost_guard');
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('E13: retrySuggest durante o backoff de 429 não faz request e marca `rate_limited`', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: false, kind: 'rate_limited' });
    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(h.suggestPlaces).toHaveBeenCalledTimes(1);

    await act(async () => { result.current.retrySuggest(); });

    expect(h.suggestPlaces).toHaveBeenCalledTimes(1);
    expect(result.current.blocked).toBe('rate_limited');
    expect(result.current.error).toBeNull();
  });

  // ── F3 · estados explícitos (E23, E25, E26, E27, E28) ───────────────────────────────────────

  it('E23: status percorre typing → loading → ok (e a lista vem com o estado junto)', async () => {
    let resolver: (v: { ok: true; suggestions: GeoSuggestion[] }) => void = () => {};
    h.suggestPlaces.mockImplementation(() => new Promise((resolve) => { resolver = resolve; }));
    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    expect(result.current.status).toBe('typing');
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(result.current.status).toBe('loading');
    await act(async () => { resolver({ ok: true, suggestions: [suggestionA] }); });
    expect(result.current.status).toBe('ok');
    expect(result.current.error).toBeNull();
  });

  it('E25: `empty` só depois de resposta vazia de verdade — durante o debounce é `typing`', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [] });
    const { result } = setup();
    act(() => { result.current.setQuery('rua sem nada'); });
    // Antes, `suggestions.length === 0` já valia aqui: a tela dizia "Nada encontrado" antes de
    // qualquer resposta chegar (C6).
    expect(result.current.status).toBe('typing');
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(result.current.status).toBe('empty');
  });

  it('E23: falha de rota é `error` (não `empty`) e o executável fica pronto para o retry', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: false, kind: 'http' });
    h.searchPlaces.mockResolvedValue({ ok: false, kind: 'http' });
    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('http');
  });

  it('E26: falha do /retrieve fica presa ao item escolhido, não vira erro da lista', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
    h.retrievePlaceResult.mockResolvedValue({ ok: false, kind: 'network' });
    h.searchPlaces.mockResolvedValue({ ok: false, kind: 'network' });

    const { result, place } = await typeAndSelectFirst('rua a');

    expect(place).toBeNull();
    expect(result.current.status).toBe('ok');
    expect(result.current.error).toBeNull();
    expect(result.current.suggestions).toEqual([suggestionA]);
    expect(result.current.retrieveError).toEqual({ id: 'a', kind: 'network' });
  });

  it('E27: pausado (429) mantém o aviso ao digitar de novo — e não dispara request', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: false, kind: 'rate_limited' });
    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(h.suggestPlaces).toHaveBeenCalledTimes(1);

    await act(async () => { result.current.retrySuggest(); });
    expect(result.current.status).toBe('paused');
    expect(result.current.blocked).toBe('rate_limited');

    act(() => { result.current.setQuery('rua ab'); });
    // E27: a tecla não transforma a pausa em "digitando" (esqueleto que nunca sai) nem em vazio.
    expect(result.current.status).toBe('paused');
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(h.suggestPlaces).toHaveBeenCalledTimes(1);
  });

  it('E28: apagar até menos de 3 caracteres limpa a lista, volta para `idle` e aborta a consulta em voo', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
    const { result } = setup();
    act(() => { result.current.setQuery('rua'); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(result.current.suggestions).toEqual([suggestionA]);

    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    act(() => { result.current.setQuery('ru'); });

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.status).toBe('idle');
    expect(abortSpy).toHaveBeenCalled();
    abortSpy.mockRestore();
  });

  // ─── Onda 2 (auditoria adversarial): as corridas que sobraram no picker ──────────────────
  // Todas foram reproduzidas no bundle real de produção (W5) antes destes testes.

  it('A3-03: resposta do termo ANTIGO é descartada na janela do debounce (antes de o novo termo disparar)', async () => {
    let resolveOld: (v: { ok: true; suggestions: GeoSuggestion[] }) => void = () => {};
    const oldPromise = new Promise<{ ok: true; suggestions: GeoSuggestion[] }>((r) => { resolveOld = r; });
    h.suggestPlaces.mockImplementationOnce(() => oldPromise);

    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });
    // Tecla nova: o debounce do termo novo ainda NÃO disparou — é a janela em que a resposta
    // do termo antigo chegava e pintava a lista de um endereço que o operador já trocou.
    act(() => { result.current.setQuery('rua ab'); });

    await act(async () => { resolveOld({ ok: true, suggestions: [suggestionA] }); });
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.status).not.toBe('ok');
  });

  it('A3-05: clear() (Esc/Cancelar) invalida o /retrieve em voo — nada é aplicado depois', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
    let resolveRetrieve: (v: { ok: true; place: GeoSearchPlace }) => void = () => {};
    h.retrievePlaceResult.mockImplementationOnce(() => new Promise((r) => { resolveRetrieve = r; }));

    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });

    const escolhido: Array<GeoSearchPlace | null> = [];
    const emVoo = (async () => {
      await act(async () => { escolhido.push(await result.current.select(0)); });
    })();
    act(() => { result.current.clear(); });
    await act(async () => { resolveRetrieve({ ok: true, place: forwardA }); });
    await emVoo;

    expect(escolhido).toEqual([null]);
    expect(result.current.retrievingId).toBeNull();
    expect(result.current.retrieveError).toBeNull();
  });

  it('R2-INB-037: trocar o termo durante o /retrieve invalida a seleção em voo — o endereço antigo não é aplicado', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
    let resolveRetrieve: (v: { ok: true; place: GeoSearchPlace }) => void = () => {};
    h.retrievePlaceResult.mockImplementationOnce(() => new Promise((r) => { resolveRetrieve = r; }));

    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(result.current.suggestions).toEqual([suggestionA]);

    // O operador escolhe a sugestão A: o `/retrieve` dela fica em voo (o input NÃO é desabilitado
    // durante o retrieve — é justamente essa janela que o achado descreve).
    let escolhido: GeoSearchPlace | null = null;
    const emVoo = (async () => {
      await act(async () => { escolhido = await result.current.select(0); });
    })();

    // Antes da resposta chegar, ele digita um termo NOVO (quer procurar B).
    act(() => { result.current.setQuery('rua b'); });

    await act(async () => { resolveRetrieve({ ok: true, place: forwardA }); });
    await emVoo;

    // A resposta pertence ao TERMO anterior: não pode ser entregue ao consumidor, que a aplicaria
    // por cima da busca nova (e o `clear()` seguinte apagaria o termo que o operador está digitando).
    expect(escolhido).toBeNull();
    expect(result.current.query).toBe('rua b');
    expect(result.current.retrievingId).toBeNull();
    expect(result.current.retrieveError).toBeNull();
    // Sem seleção aplicada não há evento de escolha — a telemetria não pode dizer que A foi escolhida.
    expect(h.logAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'searchbox_selected' }));
  });

  it('A3-02: enabled=false (troca de aba) aborta o /suggest em voo e descarta a resposta', async () => {
    let resolveSuggest: (v: { ok: true; suggestions: GeoSuggestion[] }) => void = () => {};
    h.suggestPlaces.mockImplementationOnce(() => new Promise((r) => { resolveSuggest = r; }));
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useAddressAutocomplete({ token: 'tok', enabled }),
      { initialProps: { enabled: true } },
    );
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(h.suggestPlaces).toHaveBeenCalledTimes(1);

    rerender({ enabled: false });   // aba 'map' deixa de estar ativa
    expect(abortSpy).toHaveBeenCalled();

    await act(async () => { resolveSuggest({ ok: true, suggestions: [suggestionA] }); });
    expect(result.current.suggestions).toEqual([]);
    abortSpy.mockRestore();
  });

  it('A3-02: enabled=false também invalida o /retrieve em voo', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
    let resolveRetrieve: (v: { ok: true; place: GeoSearchPlace }) => void = () => {};
    h.retrievePlaceResult.mockImplementationOnce(() => new Promise((r) => { resolveRetrieve = r; }));

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useAddressAutocomplete({ token: 'tok', enabled }),
      { initialProps: { enabled: true } },
    );
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });

    // A seleção tem de estar em voo ANTES da troca de aba — é essa a corrida que o teste mede.
    let selecao: Promise<GeoSearchPlace | null> = Promise.resolve(null);
    act(() => { selecao = result.current.select(0); });
    expect(h.retrievePlaceResult).toHaveBeenCalledTimes(1);

    rerender({ enabled: false });
    await act(async () => { resolveRetrieve({ ok: true, place: forwardA }); });
    expect(await selecao).toBeNull();
  });

  // E64 · o leitor de tela do PRÓPRIO operador ouve a escolha. O anúncio é texto de DOM (região
  // viva) — nunca auditoria: os eventos do E50 seguem com shape fechado {source, kind}.
  describe('E64 — o leitor de tela anuncia a seleção', () => {
    it('E64: após select() a escolha é anunciada com o nome da sugestão', async () => {
      h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
      h.retrievePlaceResult.mockResolvedValue({
        ok: true,
        place: { lat: -23.5613, lng: -46.6565, name: 'Rua A, 1', address: 'Rua A, 1, São Paulo' },
      });
      const { result } = setup();
      expect(result.current.selectionAnnouncement).toBe('');
      act(() => { result.current.setQuery('rua a'); });
      await act(async () => { vi.advanceTimersByTime(300); });

      await act(async () => { await result.current.select(0); });

      expect(result.current.selectionAnnouncement).toBe('Endereço escolhido: Rua A');
    });

    it('E64: sugestão do /forward (já com coords, sem /retrieve) também é anunciada', async () => {
      h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionPoiForward] });
      const { result } = setup();
      act(() => { result.current.setQuery('rua a'); });
      await act(async () => { vi.advanceTimersByTime(300); });

      await act(async () => { await result.current.select(0); });

      expect(h.retrievePlaceResult).not.toHaveBeenCalled();
      expect(result.current.selectionAnnouncement).toBe('Endereço escolhido: Rua A');
    });

    it('E64: a mensagem anterior é substituída — nunca acumula', async () => {
      h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA, suggestionB] });
      h.retrievePlaceResult.mockResolvedValue({
        ok: true,
        place: { lat: -23.5, lng: -46.6, name: 'Rua B, 2', address: 'Rua B, 2, São Paulo' },
      });
      const { result } = setup();
      act(() => { result.current.setQuery('rua'); });
      await act(async () => { vi.advanceTimersByTime(300); });

      await act(async () => { await result.current.select(0); });
      expect(result.current.selectionAnnouncement).toBe('Endereço escolhido: Rua A');

      await act(async () => { await result.current.select(1); });
      expect(result.current.selectionAnnouncement).toBe('Endereço escolhido: Rua B');
      // a antiga foi SUBSTITUÍDA, não somada
      expect(result.current.selectionAnnouncement).not.toContain('Rua A');
    });

    it('E64: o nome NÃO entra em logAudit — o anúncio é só do leitor de tela', async () => {
      h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
      h.retrievePlaceResult.mockResolvedValue({
        ok: true,
        place: { lat: -23.5, lng: -46.6, name: 'Rua A, 1', address: 'Rua A, 1, São Paulo' },
      });
      const { result } = setup();
      act(() => { result.current.setQuery('rua a'); });
      await act(async () => { vi.advanceTimersByTime(300); });

      await act(async () => { await result.current.select(0); });

      // E50: shape fechado {source, kind}. O anúncio do E64 vive no DOM, não na auditoria.
      const json = JSON.stringify(h.logAudit.mock.calls);
      expect(json).not.toContain('Rua A');
      expect(json).not.toContain('Endereço escolhido');
    });
  });
});
