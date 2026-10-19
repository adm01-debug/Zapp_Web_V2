import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  loadMapbox: vi.fn(),
  reportClientError: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => h.invoke(...args) } } }));
vi.mock('@/lib/errorReporter', () => ({ reportClientError: (...args: unknown[]) => h.reportClientError(...args) }));
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock('@/lib/mapboxLoader', () => ({ loadMapbox: () => h.loadMapbox() }));

import { LocationMessageDisplay } from '../LocationMessage';
import { resetMapboxTokenForTests } from '@/lib/mapboxToken';
import { resetReverseGeocodeCacheForTests } from '@/lib/mapboxGeocode';

type Handler = (event?: unknown) => void;

class FakeMap {
  static instances: FakeMap[] = [];
  handlers = new Map<string, Handler[]>();
  constructor() { FakeMap.instances.push(this); }
  on(event: string, handler: Handler) {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }
  remove() {}
}

class FakeMarker {
  setLngLat() { return this; }
  addTo() { return this; }
}

const fakeMapbox = { Map: FakeMap, Marker: FakeMarker, accessToken: '' };

const liveLocation = { latitude: -23.55, longitude: -46.63, name: 'Av. Paulista', isLive: true };

describe('LocationMessageDisplay — rótulo "até" da localização ao vivo', () => {
  beforeEach(() => {
    h.invoke.mockReset();
    h.reportClientError.mockReset();
    h.loadMapbox.mockReset();
    h.loadMapbox.mockResolvedValue(fakeMapbox);
    h.invoke.mockResolvedValue({ data: { token: 'pk.test' }, error: null });
    FakeMap.instances = [];
    resetMapboxTokenForTests();
    resetReverseGeocodeCacheForTests();
    h.fetch.mockReset();
    h.fetch.mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', h.fetch);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('data inválida não vira "Invalid Date": o trecho "· até" some', () => {
    render(<LocationMessageDisplay location={{ ...liveLocation, liveUntil: 'data-invalida' }} isSent={false} />);

    expect(screen.getByText('Localização em tempo real')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/· até/)).not.toBeInTheDocument();
  });

  it('data válida mantém o horário limite no rótulo', () => {
    render(
      <LocationMessageDisplay location={{ ...liveLocation, liveUntil: '2026-10-15T18:30:00.000Z' }} isSent={false} />,
    );

    expect(screen.getByText(/· até \d{2}:\d{2}/)).toBeInTheDocument();
  });
});
