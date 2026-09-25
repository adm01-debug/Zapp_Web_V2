import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { GeoSuggestion } from '@/lib/mapboxGeocode';

const h = vi.hoisted(() => ({
  suggestPlaces: vi.fn(),
  retrievePlace: vi.fn(),
  getSearchSession: vi.fn(),
  noteSuggestCall: vi.fn(),
  noteRetrieveCall: vi.fn(),
  endSearchSession: vi.fn(),
}));

vi.mock('@/lib/mapboxGeocode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mapboxGeocode')>();
  return {
    ...actual,
    suggestPlaces: (...args: unknown[]) => h.suggestPlaces(...args),
    retrievePlace: (...args: unknown[]) => h.retrievePlace(...args),
  };
});
vi.mock('@/lib/mapboxSession', () => ({
  getSearchSession: () => h.getSearchSession(),
  noteSuggestCall: () => h.noteSuggestCall(),
  noteRetrieveCall: () => h.noteRetrieveCall(),
  endSearchSession: () => h.endSearchSession(),
}));

import { useAddressAutocomplete } from '../useAddressAutocomplete';

const suggestionA: GeoSuggestion = { id: 'a', name: 'Rua A', address: 'Rua A, São Paulo', kind: 'street' };
const suggestionB: GeoSuggestion = { id: 'b', name: 'Rua B', address: 'Rua B, São Paulo', kind: 'street' };
const suggestionC: GeoSuggestion = { id: 'c', name: 'Rua C', address: 'Rua C, São Paulo', kind: 'street' };

type KeyDownEvent = Parameters<ReturnType<typeof useAddressAutocomplete>['onKeyDown']>[0];

function fakeKeyEvent(key: string): KeyDownEvent {
  return { key, preventDefault: vi.fn() } as unknown as KeyDownEvent;
}

describe('useAddressAutocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.suggestPlaces.mockReset();
    h.retrievePlace.mockReset();
    h.getSearchSession.mockReset().mockReturnValue('session-1');
    h.noteSuggestCall.mockReset();
    h.noteRetrieveCall.mockReset();
    h.endSearchSession.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = (overrides?: Partial<Parameters<typeof useAddressAutocomplete>[0]>) =>
    renderHook(() => useAddressAutocomplete({ token: 'tok', enabled: true, ...overrides }));

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

  it('select() chama retrievePlace, devolve a coordenada e encerra a sessão', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
    h.retrievePlace.mockResolvedValue({ address: 'Rua A, 1', lat: -23.5, lng: -46.6 });
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
    h.retrievePlace.mockResolvedValue(null);
    const { result } = setup();
    act(() => { result.current.setQuery('rua a'); });
    await act(async () => { vi.advanceTimersByTime(300); });

    await act(async () => { await result.current.select(0); });

    expect(result.current.suggestions).toEqual([suggestionA]);
    expect(result.current.error).toBe('not_found');
    expect(result.current.retrievingId).toBeNull();
  });

  it('teclado: ArrowDown/ArrowUp/Home/End navegam e Enter seleciona o destacado', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA, suggestionB, suggestionC] });
    h.retrievePlace.mockResolvedValue({ address: 'x', lat: 1, lng: 1 });
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

    await act(async () => { result.current.onKeyDown(fakeKeyEvent('Enter')); });
    expect(h.retrievePlace).toHaveBeenCalledWith('a', 'tok', expect.objectContaining({ session: 'session-1' }));

    act(() => { result.current.onKeyDown(fakeKeyEvent('Escape')); });
    expect(result.current.query).toBe('');
    expect(result.current.suggestions).toEqual([]);
  });

  it('Enter sem item destacado não chama select', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
    const { result } = setup();
    act(() => { result.current.setQuery('rua'); });
    await act(async () => { vi.advanceTimersByTime(300); });

    act(() => { result.current.onKeyDown(fakeKeyEvent('Enter')); });
    expect(h.retrievePlace).not.toHaveBeenCalled();
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
});
