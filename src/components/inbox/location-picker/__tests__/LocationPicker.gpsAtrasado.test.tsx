/**
 * R2-INB-036 (#330) — GPS atrasado não pode substituir um ponto escolhido à mão DEPOIS dele, no
 * mesmo picker.
 *
 * Diferente de `LocationPicker.test.tsx` (que isola a tela mockando o hook), aqui a tela é a de
 * verdade: `LocationPicker` + `useLocationPicker` reais, e o caminho é só de eventos do usuário —
 * clicar em "Usar localização atual", ir para a aba do mapa e marcar/ escolher o ponto.
 *
 * Por que o defeito é real: `navigator.geolocation.getCurrentPosition` NÃO tem cancelamento — a
 * resposta do aparelho chega quando chegar (o `timeout: 10000` é o teto, não a promessa de
 * silêncio). Quem chega depois não pode vencer quem o operador escolheu antes, e é justamente o
 * contrário que o código fazia: a resposta atrasada chamava `select(..., 'gps')` por cima do ponto
 * manual e o "Enviar Localização" mandava a coordenada errada.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  getToken: vi.fn(),
  report: vi.fn(),
  loadMapbox: vi.fn(),
  toast: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() }, rpc: vi.fn().mockResolvedValue({ data: 0, error: null }) },
}));
vi.mock('@/lib/errorReporter', () => ({ reportClientError: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
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
vi.mock('@/lib/audit', () => ({ logAudit: (...args: unknown[]) => h.logAudit(...args) }));

import { LocationPicker } from '../../LocationPicker';
import { resetReverseGeocodeCacheForTests } from '@/lib/mapboxGeocode';

type Handler = (event?: unknown) => void;

class FakeMap {
  static instances: FakeMap[] = [];
  opts: { center: [number, number]; zoom: number };
  handlers = new Map<string, Handler[]>();
  removed = false;
  flyTo = vi.fn();
  addControl = vi.fn();
  getCenter() { return { lng: this.opts.center[0], lat: this.opts.center[1] }; }
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

/** GPS sob controle do teste: o aparelho só responde quando `responder()` é chamado. */
function gpsControlado() {
  let respondeOk: ((position: unknown) => void) | null = null;
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (onOk: (position: unknown) => void) => { respondeOk = onOk; },
    },
  });
  return {
    pedido() { return respondeOk !== null; },
    responder(lat: number, lng: number) {
      if (!respondeOk) throw new Error('o GPS não foi pedido antes de responder');
      respondeOk({ coords: { latitude: lat, longitude: lng } });
    },
  };
}

/** Vai para a aba do mapa e devolve o mapa falso já "carregado". */
async function abrirMapa() {
  const aba = screen.getByRole('tab', { name: /Escolher no Mapa/ });
  fireEvent.click(aba);
  fireEvent.focus(aba);
  await waitFor(() => expect(FakeMap.instances).toHaveLength(1));
  act(() => FakeMap.instances[0].emit('load'));
  return FakeMap.instances[0];
}

/** Botão de GPS da aba do mapa: fica desabilitado enquanto um pedido está em voo. */
function botaoGpsDoMapa() {
  return screen.getByRole('button', { name: 'Usar minha localização atual' });
}

describe('LocationPicker — GPS atrasado x escolha manual (R2-INB-036)', () => {
  beforeEach(() => {
    h.getToken.mockReset();
    h.report.mockReset();
    h.toast.mockReset();
    h.logAudit.mockReset();
    h.loadMapbox.mockReset();
    h.loadMapbox.mockResolvedValue(fakeMapbox);
    h.getToken.mockResolvedValue('pk.test');
    FakeMap.instances = [];
    FakeMarker.instances = [];
    resetReverseGeocodeCacheForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resposta do GPS que chega depois do clique no mapa não troca o ponto marcado à mão', async () => {
    const gps = gpsControlado();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ text: 'Rua Escolhida', place_name: 'Rua Escolhida, 100' }] }),
    }));
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<LocationPicker open onOpenChange={vi.fn()} onSend={onSend} />);
    // O token do Mapbox precisa estar no estado antes do clique: é ele que faz o GPS resolver
    // também o endereço (o caminho "só coordenada" é outro, e não é o desta corrida).
    await act(async () => {});

    // 1) O operador pede a localização atual — o aparelho ainda não respondeu.
    fireEvent.click(screen.getByRole('button', { name: /Usar localização atual/ }));
    expect(gps.pedido()).toBe(true);

    // 2) Ele desiste, vai para o mapa e marca o ponto à mão.
    await abrirMapa();
    act(() => FakeMap.instances[0].emit('click', { lngLat: { lng: -46.6, lat: -23.5 } }));
    const enviar = screen.getByRole('button', { name: /Enviar Localização/ });
    await waitFor(() => expect(enviar).toBeEnabled());

    // 3) Só agora o GPS responde, com outro ponto. O botão volta a ficar ocioso quando a
    //    resposta inteira (endereço incluso) termina — é o sinal de que a corrida acabou.
    await act(async () => { gps.responder(-15.78, -47.93); });
    await waitFor(() => expect(botaoGpsDoMapa()).toBeEnabled());

    // 4) O ponto de pé continua sendo o do operador — no mapa e no que vai ser enviado.
    expect(FakeMarker.instances[0].lngLat).toEqual([-46.6, -23.5]);
    fireEvent.click(enviar);
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ latitude: -23.5, longitude: -46.6 }));
    expect(onSend).not.toHaveBeenCalledWith(expect.objectContaining({ latitude: -15.78 }));
  });

  it('endereço do GPS que volta depois de uma sugestão escolhida não troca o ponto', async () => {
    const gps = gpsControlado();
    let responderReversoDoGps: (() => void) | null = null;
    const fetchMock = vi.fn((url: string) => {
      // O reverso do GPS fica PENDURADO: é a resposta que chega depois da escolha do operador.
      if (url.includes('geocoding/v5')) {
        return new Promise((resolve) => {
          responderReversoDoGps = () => resolve({
            ok: true,
            json: async () => ({ features: [{ text: 'Onde o GPS estava', place_name: 'Ponto do GPS' }] }),
          });
        });
      }
      if (url.includes('/suggest')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            suggestions: [
              { mapbox_id: 'a', name: 'XBZ Brindes', full_address: 'R. da Independência, São Paulo', feature_type: 'poi' },
              { mapbox_id: 'b', name: 'Brindes Curitiba', full_address: 'Curitiba - PR', feature_type: 'poi' },
            ],
          }),
        });
      }
      if (url.includes('/retrieve')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            features: [{
              geometry: { coordinates: [-46.65, -23.55] },
              properties: { name: 'XBZ Brindes', full_address: 'R. da Independência, São Paulo' },
            }],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ features: [] }) });
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<LocationPicker open onOpenChange={vi.fn()} onSend={onSend} />);
    // Token do Mapbox no estado antes do clique (ver o primeiro teste).
    await act(async () => {});

    // 1) O GPS volta primeiro: o ponto dele entra no mapa e o endereço dele ainda está a caminho.
    fireEvent.click(screen.getByRole('button', { name: /Usar localização atual/ }));
    await abrirMapa();
    await act(async () => { gps.responder(-15.78, -47.93); });
    await waitFor(() => expect(responderReversoDoGps).not.toBeNull());

    // 2) Com o endereço do GPS ainda em voo, o operador escolhe um endereço na lista.
    const campo = screen.getByRole('combobox');
    fireEvent.change(campo, { target: { value: 'xbz' } });
    const opcao = await screen.findByRole('option', { name: /^XBZ/, }, { timeout: 5_000 });
    fireEvent.click(opcao);
    const enviar = screen.getByRole('button', { name: /Enviar Localização/ });
    await waitFor(() => expect(enviar).toBeEnabled());

    // 3) O endereço do GPS chega agora — tarde.
    await act(async () => { responderReversoDoGps?.(); });

    // 4) Quem venceu foi a escolha do operador.
    fireEvent.click(enviar);
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ latitude: -23.55, longitude: -46.65 }));
    expect(onSend).not.toHaveBeenCalledWith(expect.objectContaining({ latitude: -15.78 }));
  });
});
