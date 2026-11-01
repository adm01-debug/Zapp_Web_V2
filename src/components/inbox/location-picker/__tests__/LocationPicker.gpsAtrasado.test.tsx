/**
 * R2-INB-036 — GPS atrasado não substitui ponto escolhido manualmente.
 *
 * Cenário: usuário clica no mapa (ou escolhe sugestão) e, depois disso,
 * o GPS resolve e devolve coordenadas. O ponto manual deve prevalecer;
 * o GPS só é aceito se ainda não houver escolha manual.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ---- Mocks hoisted (precisam de referência estável antes dos imports) -------

const { resolveGps, gpsControlado } = vi.hoisted(() => {
  let _resolve: ((pos: GeolocationPosition) => void) | null = null;

  const gpsControlado = () =>
    new Promise<GeolocationPosition>((res) => {
      _resolve = res;
    });

  const resolveGps = (lat: number, lng: number) => {
    _resolve?.({
      coords: { latitude: lat, longitude: lng, accuracy: 1 } as GeolocationCoordinates,
      timestamp: Date.now(),
    });
  };

  return { resolveGps, gpsControlado };
});

const { FakeMap, FakeMarker, FakeNavigationControl, getMapClickHandler } = vi.hoisted(() => {
  let _onClick: ((e: { lngLat: { lat: number; lng: number } }) => void) | null = null;

  class FakeMap extends React.Component<{ onClick?: (e: { lngLat: { lat: number; lng: number } }) => void; children?: React.ReactNode }> {
    constructor(props: { onClick?: (e: { lngLat: { lat: number; lng: number } }) => void; children?: React.ReactNode }) {
      super(props);
      _onClick = props.onClick ?? null;
    }
    componentDidUpdate(prev: { onClick?: (e: { lngLat: { lat: number; lng: number } }) => void }) {
      if (prev.onClick !== this.props.onClick) _onClick = this.props.onClick ?? null;
    }
    render() { return <div data-testid="fake-map">{this.props.children}</div>; }
  }

  class FakeMarker extends React.Component<{ longitude: number; latitude: number }> {
    render() {
      return (
        <div
          data-testid="marker"
          data-lat={this.props.latitude}
          data-lng={this.props.longitude}
        />
      );
    }
  }

  class FakeNavigationControl extends React.Component {
    render() { return <div data-testid="nav-control" />; }
  }

  const getMapClickHandler = () => _onClick;

  return { FakeMap, FakeMarker, FakeNavigationControl, getMapClickHandler };
});

vi.mock('react-map-gl/maplibre', () => ({
  Map: FakeMap,
  Marker: FakeMarker,
  NavigationControl: FakeNavigationControl,
  useMap: () => ({ current: null }),
}));

vi.mock('@/hooks/location/useGeolocation', () => ({
  useGeolocation: () => ({ getPosition: gpsControlado }),
}));

vi.mock('@/hooks/location/useAddressSearch', () => ({
  useAddressSearch: () => ({
    suggestions: [],
    isLoading: false,
    search: vi.fn(),
    clearSuggestions: vi.fn(),
  }),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) },
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),
}));

import { LocationPicker } from '@/components/inbox/location-picker/LocationPicker';

describe('R2-INB-036 — GPS atrasado não substitui clique manual', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clique no mapa antes do GPS: ponto manual prevalece', async () => {
    const onSelect = vi.fn();
    const { unmount } = render(<LocationPicker onLocationSelect={onSelect} />);

    // Usuário clica no botão "Usar minha localização" (dispara GPS async)
    const gpsButton = screen.getByRole('button', { name: /localiza/i });
    await act(async () => { fireEvent.click(gpsButton); });

    // Antes de o GPS resolver, usuário clica no mapa
    const manualLat = -23.55;
    const manualLng = -46.63;
    await act(async () => {
      getMapClickHandler()?.({ lngLat: { lat: manualLat, lng: manualLng } });
    });

    // GPS resolve depois (resposta atrasada)
    await act(async () => { resolveGps(-22.9, -43.17); });

    // O marcador deve estar no ponto manual, não no GPS
    const marker = screen.getByTestId('marker');
    expect(Number(marker.dataset.lat)).toBeCloseTo(manualLat, 2);
    expect(Number(marker.dataset.lng)).toBeCloseTo(manualLng, 2);

    unmount();
  });

  it('sugestão de endereço escolhida antes do GPS: ponto da sugestão prevalece', async () => {
    const onSelect = vi.fn();

    // Substitui o hook de busca para expor uma sugestão clicável
    const { useAddressSearch } = await import('@/hooks/location/useAddressSearch');
    vi.mocked(useAddressSearch).mockReturnValue({
      suggestions: [{ id: 's1', label: 'Rua A, 1', lat: -23.6, lng: -46.7 }],
      isLoading: false,
      search: vi.fn(),
      clearSuggestions: vi.fn(),
    });

    const { unmount } = render(<LocationPicker onLocationSelect={onSelect} />);

    // Dispara GPS
    const gpsButton = screen.getByRole('button', { name: /localiza/i });
    await act(async () => { fireEvent.click(gpsButton); });

    // Escolhe sugestão antes de o GPS resolver
    const suggestion = screen.getByText('Rua A, 1');
    await act(async () => { fireEvent.click(suggestion); });

    // GPS resolve
    await act(async () => { resolveGps(-22.9, -43.17); });

    const marker = screen.getByTestId('marker');
    expect(Number(marker.dataset.lat)).toBeCloseTo(-23.6, 2);
    expect(Number(marker.dataset.lng)).toBeCloseTo(-46.7, 2);

    unmount();
  });
});
