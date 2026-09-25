import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  getToken: vi.fn(),
  report: vi.fn(),
  loadMapbox: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('@/lib/errorReporter', () => ({ reportClientError: vi.fn() }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/mapboxToken', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mapboxToken')>();
  return {
    ...actual,
    getMapboxToken: (...args: unknown[]) => h.getToken(...args),
    reportMapboxFailure: (...args: unknown[]) => h.report(...args),
  };
});
vi.mock('@/lib/mapboxLoader', () => ({ loadMapbox: () => h.loadMapbox() }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: (...args: unknown[]) => h.toast(...args) }));

import { useLocationPicker } from '../useLocationPicker';
import { MapboxTokenError, MAPBOX_MAP_LOAD_TIMEOUT_MS } from '@/lib/mapboxToken';

type Handler = (event?: unknown) => void;

class FakeMap {
  static instances: FakeMap[] = [];
  opts: { center: [number, number]; zoom: number };
  handlers = new Map<string, Handler[]>();
  removed = false;
  flyTo = vi.fn();
  addControl = vi.fn();
  constructor(opts: { center: [number, number]; zoom: number }) {
    this.opts = opts;
    FakeMap.instances.push(this);
  }
  on(event: string, handler: Handler) {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }
  emit(event: string, payload?: unknown) { this.handlers.get(event)?.forEach((fn) => fn(payload)); }
  remove() { this.removed = true; }
}

class FakeMarker {
  static instances: FakeMarker[] = [];
  lngLat: [number, number] | null = null;
  constructor() { FakeMarker.instances.push(this); }
  setLngLat(value: [number, number]) { this.lngLat = value; return this; }
  addTo() { return this; }
}

class FakeNavigationControl {}

const fakeMapbox = { Map: FakeMap, Marker: FakeMarker, NavigationControl: FakeNavigationControl, accessToken: '' };

type Props = { open: boolean; tab: 'map' | 'current' };
type View = ReturnType<typeof renderPicker>;

function mockGeolocation(lat: number, lng: number) {
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (onOk: (position: { coords: { latitude: number; longitude: number } }) => void) =>
        onOk({ coords: { latitude: lat, longitude: lng } }),
    },
  });
}

// Começa na aba "current": o container do mapa ainda não existe, como no Radix.
function renderPicker() {
  return renderHook((p: Props) => useLocationPicker(p.open, p.tab), { initialProps: { open: true, tab: 'current' } as Props });
}

// O Radix monta os filhos da aba num render POSTERIOR ao da troca (`children: present &&
// children`, com o `present` virando true só no layout-effect do Presence). Por isso o
// container sempre chega depois de o effect do mapa já ter rodado — esta é a ordem real
// do navegador, e é o que os testes precisam exercitar.
async function attachContainer(view: View) {
  await act(async () => { view.result.current.mapContainer(document.createElement('div')); });
}

async function renderReadyOnMapTab() {
  const view = renderPicker();
  await act(async () => {});
  await act(async () => { view.rerender({ open: true, tab: 'map' }); });
  await attachContainer(view);
  await waitFor(() => expect(FakeMap.instances).toHaveLength(1));
  return view;
}

describe('useLocationPicker', () => {
  beforeEach(() => {
    h.getToken.mockReset();
    h.report.mockReset();
    h.toast.mockReset();
    h.loadMapbox.mockReset();
    h.loadMapbox.mockResolvedValue(fakeMapbox);
    FakeMap.instances = [];
    FakeMarker.instances = [];
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('carrega o mapa e limpa o spinner no evento load', async () => {
    h.getToken.mockResolvedValue('pk.test');
    const view = await renderReadyOnMapTab();
    expect(FakeMap.instances[0].opts.center).toEqual([-46.6333, -23.5505]);
    act(() => FakeMap.instances[0].emit('load'));
    expect(view.result.current.isMapLoaded).toBe(true);
    expect(view.result.current.mapError).toBeNull();
  });

  it('container que só aparece depois da troca de aba ainda cria o mapa e arma o watchdog', async () => {
    vi.useFakeTimers();
    h.getToken.mockResolvedValue('pk.test');
    const view = renderPicker();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    // Troca de aba: o effect roda antes de o container existir (Presence do Radix).
    await act(async () => { view.rerender({ open: true, tab: 'map' }); await vi.advanceTimersByTimeAsync(0); });
    expect(FakeMap.instances).toHaveLength(0);

    // Container chega no render seguinte: o effect precisa reagir a isso.
    await act(async () => { view.result.current.mapContainer(document.createElement('div')); await vi.advanceTimersByTimeAsync(0); });
    expect(FakeMap.instances).toHaveLength(1);

    // E o watchdog tem de estar armado: sem 'load', vira erro com retry.
    await act(async () => { await vi.advanceTimersByTimeAsync(MAPBOX_MAP_LOAD_TIMEOUT_MS); });
    expect(view.result.current.mapError).toBe('O mapa demorou demais para carregar.');
    expect(h.report).toHaveBeenCalledWith('timeout', 'picker');
  });

  it('timeout do token vira mensagem de timeout e é reportado', async () => {
    h.getToken.mockRejectedValue(new MapboxTokenError('timeout'));
    const view = renderPicker();
    await waitFor(() => expect(view.result.current.mapError).toBe('O mapa demorou demais para carregar.'));
    expect(h.report).toHaveBeenCalledWith('timeout', 'picker', expect.any(MapboxTokenError));
  });

  it('sessão expirada mostra a causa em vez da mensagem genérica', async () => {
    h.getToken.mockRejectedValue(new MapboxTokenError('unauthorized'));
    const view = renderPicker();
    await waitFor(() => expect(view.result.current.mapError).toBe('Sessão expirada. Recarregue a página.'));
  });

  it('erro 401 do mapa vira "token inválido"', async () => {
    h.getToken.mockResolvedValue('pk.test');
    const view = await renderReadyOnMapTab();
    act(() => FakeMap.instances[0].emit('error', { error: { status: 401 } }));
    expect(view.result.current.mapError).toBe('O token do mapa é inválido ou expirou.');
    expect(h.report).toHaveBeenCalledWith('invalid_token', 'picker', { status: 401 });
  });

  it('sem load em 20 s mostra erro; um load tardio limpa o erro', async () => {
    vi.useFakeTimers();
    h.getToken.mockResolvedValue('pk.test');
    const view = renderPicker();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { view.rerender({ open: true, tab: 'map' }); await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { view.result.current.mapContainer(document.createElement('div')); await vi.advanceTimersByTimeAsync(0); });
    expect(FakeMap.instances).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(MAPBOX_MAP_LOAD_TIMEOUT_MS); });
    expect(view.result.current.mapError).toBe('O mapa demorou demais para carregar.');
    expect(h.report).toHaveBeenCalledWith('timeout', 'picker');
    act(() => FakeMap.instances[0].emit('load'));
    expect(view.result.current.mapError).toBeNull();
  });

  it('retry limpa o erro e busca o token de novo com force', async () => {
    h.getToken.mockRejectedValueOnce(new MapboxTokenError('network')).mockResolvedValue('pk.test');
    const view = renderPicker();
    await waitFor(() => expect(view.result.current.mapError).toBe('Sem conexão com o servidor de mapas.'));
    act(() => view.result.current.retryMap());
    expect(view.result.current.mapError).toBeNull();
    await waitFor(() => expect(h.getToken).toHaveBeenCalledTimes(2));
    expect(h.getToken).toHaveBeenNthCalledWith(1, { force: false });
    expect(h.getToken).toHaveBeenNthCalledWith(2, { force: true });
  });

  it('GPS seleciona a coordenada mesmo sem token do Mapbox', async () => {
    h.getToken.mockRejectedValue(new MapboxTokenError('server_error'));
    mockGeolocation(-23.5, -46.6);
    const view = renderPicker();
    await waitFor(() => expect(view.result.current.mapError).not.toBeNull());
    await act(async () => { view.result.current.getCurrentLocation(); });
    await waitFor(() => expect(view.result.current.selectedLocation).toEqual({ lat: -23.5, lng: -46.6 }));
  });

  it('recria o mapa centrado e o marcador ao voltar para a aba do mapa', async () => {
    h.getToken.mockResolvedValue('pk.test');
    mockGeolocation(-23.5, -46.6);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [{ text: 'Rua A', place_name: 'Rua A, São Paulo' }] }) }));
    const view = await renderReadyOnMapTab();
    act(() => FakeMap.instances[0].emit('load'));
    await act(async () => { view.result.current.getCurrentLocation(); });
    await waitFor(() => expect(view.result.current.selectedLocation?.address).toBe('Rua A, São Paulo'));

    // Sair da aba desmonta o container no Radix: o mapa é destruído.
    act(() => view.rerender({ open: true, tab: 'current' }));
    expect(FakeMap.instances[0].removed).toBe(true);
    await act(async () => { view.result.current.mapContainer(null); });

    act(() => view.rerender({ open: true, tab: 'map' }));
    await attachContainer(view);
    await waitFor(() => expect(FakeMap.instances).toHaveLength(2));
    expect(FakeMap.instances[1].opts.center).toEqual([-46.6, -23.5]);
    expect(FakeMap.instances[1].opts.zoom).toBe(16);
    act(() => FakeMap.instances[1].emit('load'));
    expect(FakeMarker.instances).toHaveLength(2);
    expect(FakeMarker.instances[1].lngLat).toEqual([-46.6, -23.5]);
  });

  it('busca: 429 e falha viram toast; sem resultado vira "Local não encontrado"', async () => {
    h.getToken.mockResolvedValue('pk.test');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const view = renderPicker();
    await act(async () => {});
    act(() => view.result.current.setSearchQuery('avenida paulista'));

    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    await act(async () => { await view.result.current.searchLocation(); });
    expect(h.toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Muitas buscas seguidas' }));

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await act(async () => { await view.result.current.searchLocation(); });
    expect(h.toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Falha na busca' }));

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ features: [] }) });
    await act(async () => { await view.result.current.searchLocation(); });
    expect(h.toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Local não encontrado' }));
    expect(view.result.current.isSearching).toBe(false);
  });

  it('busca sem token avisa em vez de não fazer nada', async () => {
    h.getToken.mockRejectedValue(new MapboxTokenError('server_error'));
    const view = renderPicker();
    await waitFor(() => expect(view.result.current.mapError).not.toBeNull());
    act(() => view.result.current.setSearchQuery('avenida paulista'));
    await act(async () => { await view.result.current.searchLocation(); });
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Busca indisponível' }));
  });

  it('nova busca cancela a anterior e só o resultado mais novo vale; reset limpa tudo', async () => {
    h.getToken.mockResolvedValue('pk.test');
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn((_url: string, init: { signal: AbortSignal }) => {
      signals.push(init.signal);
      if (signals.length === 1) {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ features: [{ center: [-46.6, -23.5], text: 'B', place_name: 'B, SP' }] }) });
    });
    vi.stubGlobal('fetch', fetchMock);
    const view = renderPicker();
    await act(async () => {});
    act(() => view.result.current.setSearchQuery('a'));

    let first: Promise<void> = Promise.resolve();
    act(() => { first = view.result.current.searchLocation(); });
    await act(async () => { await view.result.current.searchLocation(); });
    await act(async () => { await first; });

    expect(signals[0].aborted).toBe(true);
    expect(h.toast).not.toHaveBeenCalled();
    expect(view.result.current.selectedLocation).toEqual({ lat: -23.5, lng: -46.6, name: 'B', address: 'B, SP' });

    act(() => view.result.current.reset());
    expect(view.result.current.selectedLocation).toBeNull();
    expect(view.result.current.searchQuery).toBe('');
  });
});
