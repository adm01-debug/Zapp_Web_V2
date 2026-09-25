import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({ invoke: vi.fn(), loadMapbox: vi.fn(), reportClientError: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => h.invoke(...a) } } }));
vi.mock('@/lib/errorReporter', () => ({ reportClientError: (...a: unknown[]) => h.reportClientError(...a) }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/mapboxLoader', () => ({ loadMapbox: () => h.loadMapbox() }));

import { ContactRegionMap } from '../ContactRegionMap';
import { getRegionFromPhone } from '../ContactMapView';
import { regionCoordinates, REGION_COORDINATES } from '../contactRegionGeo';
import { resetMapboxTokenForTests } from '@/lib/mapboxToken';

type Handler = (e?: unknown) => void;

class FakeMap {
  static instances: FakeMap[] = [];
  handlers = new Map<string, Handler[]>();
  fitBounds = vi.fn();
  addControl = vi.fn();
  removed = false;
  constructor() { FakeMap.instances.push(this); }
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
  removed = false;
  constructor(private el: HTMLElement) { FakeMarker.instances.push(this); }
  setLngLat(v: [number, number]) { this.lngLat = v; return this; }
  addTo() { return this; }
  getElement() { return this.el; }
  remove() { this.removed = true; }
}

class FakeBounds {
  points: Array<[number, number]> = [];
  extend(p: [number, number]) { this.points.push(p); return this; }
  isEmpty() { return this.points.length === 0; }
}

const fakeMapbox = { Map: FakeMap, Marker: FakeMarker, NavigationControl: class {}, LngLatBounds: FakeBounds, accessToken: '' };
const tokenOk = { data: { token: 'pk.test' }, error: null };

describe('ContactRegionMap', () => {
  beforeEach(() => {
    h.invoke.mockReset();
    h.invoke.mockResolvedValue(tokenOk);
    h.loadMapbox.mockReset();
    h.loadMapbox.mockResolvedValue(fakeMapbox);
    h.reportClientError.mockReset();
    FakeMap.instances = [];
    FakeMarker.instances = [];
    resetMapboxTokenForTests();
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  const regions = [
    { region: 'São Paulo - SP', count: 40 },
    { region: 'Curitiba - PR', count: 10 },
    { region: 'Internacional', count: 3 },
  ];

  it('desenha uma bolha por região com ponto conhecido, com a contagem dentro', async () => {
    render(<ContactRegionMap regions={regions} selectedRegion={null} onSelectRegion={vi.fn()} />);
    await waitFor(() => expect(FakeMap.instances).toHaveLength(1));
    act(() => FakeMap.instances[0].emit('load'));

    // "Internacional" não tem coordenada: fica fora do mapa.
    expect(FakeMarker.instances).toHaveLength(2);
    expect(FakeMarker.instances[0].lngLat).toEqual(REGION_COORDINATES['São Paulo - SP']);
    expect(FakeMarker.instances[0].getElement().textContent).toBe('40');
    expect(FakeMarker.instances[1].getElement().textContent).toBe('10');
  });

  it('a região com mais contatos tem a bolha maior', async () => {
    render(<ContactRegionMap regions={regions} selectedRegion={null} onSelectRegion={vi.fn()} />);
    await waitFor(() => expect(FakeMap.instances).toHaveLength(1));
    act(() => FakeMap.instances[0].emit('load'));

    const sp = parseInt(FakeMarker.instances[0].getElement().style.width, 10);
    const pr = parseInt(FakeMarker.instances[1].getElement().style.width, 10);
    expect(sp).toBeGreaterThan(pr);
  });

  it('clicar na bolha avisa qual região foi escolhida', async () => {
    const onSelect = vi.fn();
    render(<ContactRegionMap regions={regions} selectedRegion={null} onSelectRegion={onSelect} />);
    await waitFor(() => expect(FakeMap.instances).toHaveLength(1));
    act(() => FakeMap.instances[0].emit('load'));

    fireEvent.click(FakeMarker.instances[1].getElement());
    expect(onSelect).toHaveBeenCalledWith('Curitiba - PR');
  });

  it('avisa que a posição é aproximada e quantas regiões ficaram fora', async () => {
    render(<ContactRegionMap regions={regions} selectedRegion={null} onSelectRegion={vi.fn()} />);
    expect(screen.getByText(/Posição aproximada pela região do DDD/)).toBeInTheDocument();
    expect(screen.getByText(/1 região sem ponto conhecido/)).toBeInTheDocument();
  });

  it('falha do token vira mensagem com retry, não spinner eterno', async () => {
    h.invoke.mockReset();
    h.invoke
      .mockResolvedValueOnce({ data: null, error: { name: 'FunctionsHttpError', context: { status: 500 } } })
      .mockResolvedValue(tokenOk);
    render(<ContactRegionMap regions={regions} selectedRegion={null} onSelectRegion={vi.fn()} />);

    expect(await screen.findByText('O serviço de mapas está indisponível no servidor.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(FakeMap.instances).toHaveLength(1));
  });

  it('todo DDD brasileiro conhecido tem coordenada no mapa', () => {
    const ddds = Object.keys(REGION_COORDINATES).length;
    expect(ddds).toBeGreaterThan(60);
    // Amostra de DDDs reais passando pela mesma função que a tela usa.
    for (const phone of ['5511999999999', '5541999999999', '5571999999999', '5592999999999']) {
      expect(regionCoordinates(getRegionFromPhone(phone))).not.toBeNull();
    }
    // DDD inexistente não inventa ponto.
    expect(regionCoordinates(getRegionFromPhone('5510999999999'))).toBeNull();
  });
});
