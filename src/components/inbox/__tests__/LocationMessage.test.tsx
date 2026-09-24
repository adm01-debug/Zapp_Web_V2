import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  loadMapbox: vi.fn(),
  reportClientError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => h.invoke(...args) } } }));
vi.mock('@/lib/errorReporter', () => ({ reportClientError: (...args: unknown[]) => h.reportClientError(...args) }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/mapboxLoader', () => ({ loadMapbox: () => h.loadMapbox() }));

import { LocationMessageDisplay } from '../LocationMessage';
import { resetMapboxTokenForTests, MAPBOX_MAP_LOAD_TIMEOUT_MS } from '@/lib/mapboxToken';

type Handler = (event?: unknown) => void;

class FakeMap {
  static instances: FakeMap[] = [];
  handlers = new Map<string, Handler[]>();
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
  setLngLat() { return this; }
  addTo() { return this; }
}

const fakeMapbox = { Map: FakeMap, Marker: FakeMarker, accessToken: '' };

const location = { latitude: -23.55, longitude: -46.63, name: 'Av. Paulista' };
const tokenOk = { data: { token: 'pk.test' }, error: null };
const serverError = { data: null, error: { name: 'FunctionsHttpError', context: { status: 500 } } };
const SERVER_MSG = 'O serviço de mapas está indisponível no servidor.';

describe('LocationMessageDisplay', () => {
  beforeEach(() => {
    h.invoke.mockReset();
    h.reportClientError.mockReset();
    h.loadMapbox.mockReset();
    h.loadMapbox.mockResolvedValue(fakeMapbox);
    FakeMap.instances = [];
    resetMapboxTokenForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('várias bolhas na mesma tela compartilham uma única busca do token', async () => {
    h.invoke.mockResolvedValue(tokenOk);
    render(
      <>
        <LocationMessageDisplay location={location} isSent={false} />
        <LocationMessageDisplay location={{ ...location, latitude: -22.9 }} isSent />
        <LocationMessageDisplay location={{ ...location, latitude: -21.1 }} isSent={false} />
      </>,
    );
    await waitFor(() => expect(FakeMap.instances).toHaveLength(3));
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it('sem token mostra a causa; "Tentar novamente" refaz a busca e carrega o mapa', async () => {
    h.invoke.mockResolvedValueOnce(serverError).mockResolvedValue(tokenOk);
    render(<LocationMessageDisplay location={location} isSent={false} />);

    expect(await screen.findByText(SERVER_MSG)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(FakeMap.instances).toHaveLength(1));
    act(() => FakeMap.instances[0].emit('load'));
    expect(screen.queryByText(SERVER_MSG)).not.toBeInTheDocument();
    expect(h.invoke).toHaveBeenCalledTimes(2);
  });

  it('sem load em 20 s vira erro de timeout; um load tardio limpa o erro', async () => {
    vi.useFakeTimers();
    h.invoke.mockResolvedValue(tokenOk);
    render(<LocationMessageDisplay location={location} isSent={false} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(FakeMap.instances).toHaveLength(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(MAPBOX_MAP_LOAD_TIMEOUT_MS); });
    expect(screen.getByText('O mapa demorou demais para carregar.')).toBeInTheDocument();
    expect(h.reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'mapbox_timeout' }),
      { source: 'mapbox_bubble', kind: 'timeout' },
    );

    act(() => FakeMap.instances[0].emit('load'));
    expect(screen.queryByText('O mapa demorou demais para carregar.')).not.toBeInTheDocument();
  });

  it('erro 401 do próprio mapa vira "token inválido"', async () => {
    h.invoke.mockResolvedValue(tokenOk);
    render(<LocationMessageDisplay location={location} isSent={false} />);
    await waitFor(() => expect(FakeMap.instances).toHaveLength(1));
    act(() => FakeMap.instances[0].emit('error', { error: { status: 401 } }));
    expect(screen.getByText('O token do mapa é inválido ou expirou.')).toBeInTheDocument();
  });

  it('os botões Abrir e Rotas continuam funcionando com o mapa em erro', async () => {
    h.invoke.mockResolvedValue(serverError);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<LocationMessageDisplay location={location} isSent={false} />);
    await screen.findByText(SERVER_MSG);

    fireEvent.click(screen.getByRole('button', { name: /Abrir/ }));
    expect(open).toHaveBeenLastCalledWith('https://www.google.com/maps?q=-23.55,-46.63', '_blank', 'noopener,noreferrer');
    fireEvent.click(screen.getByRole('button', { name: /Rotas/ }));
    expect(open).toHaveBeenLastCalledWith('https://www.google.com/maps/dir/?api=1&destination=-23.55,-46.63', '_blank', 'noopener,noreferrer');
  });

  it('não cria um segundo mapa se a coordenada mudar antes do chunk do mapbox resolver', async () => {
    h.invoke.mockResolvedValue(tokenOk);
    let resolveFirst: (mod: typeof fakeMapbox) => void = () => {};
    h.loadMapbox
      .mockReturnValueOnce(new Promise<typeof fakeMapbox>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValue(fakeMapbox);

    const view = render(<LocationMessageDisplay location={location} isSent={false} />);
    await waitFor(() => expect(h.loadMapbox).toHaveBeenCalledTimes(1));

    view.rerender(<LocationMessageDisplay location={{ ...location, latitude: -20 }} isSent={false} />);
    await waitFor(() => expect(FakeMap.instances).toHaveLength(1));

    await act(async () => { resolveFirst(fakeMapbox); });
    expect(FakeMap.instances).toHaveLength(1);
  });
});
