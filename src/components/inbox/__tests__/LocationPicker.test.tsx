import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ hook: vi.fn() }));

vi.mock('../location-picker/useLocationPicker', () => ({ useLocationPicker: (...args: unknown[]) => h.hook(...args) }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

import { LocationPicker } from '../LocationPicker';

interface Selected { lat: number; lng: number; name?: string; address?: string }

function hookState(selectedLocation: Selected | null) {
  return {
    mapContainer: { current: null },
    isMapLoaded: false,
    mapError: null,
    retryMap: vi.fn(),
    isLoadingLocation: false,
    searchQuery: '',
    setSearchQuery: vi.fn(),
    isSearching: false,
    selectedLocation,
    getCurrentLocation: vi.fn(),
    searchLocation: vi.fn(),
    reset: vi.fn(),
  };
}

describe('LocationPicker', () => {
  it('não oferece localização em tempo real (o provedor só entrega localização pontual)', () => {
    h.hook.mockReturnValue(hookState(null));
    render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);
    expect(screen.getByText('Compartilhar Localização')).toBeInTheDocument();
    expect(screen.queryByText('Localização em tempo real')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('mantém "Enviar Localização" desabilitado sem seleção', () => {
    h.hook.mockReturnValue(hookState(null));
    render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Enviar Localização/ })).toBeDisabled();
  });

  it('envia só coordenadas, nome e endereço — sem o campo isLive — e fecha o diálogo', async () => {
    const state = hookState({ lat: -23.5, lng: -46.6, name: 'Rua A', address: 'Rua A, São Paulo' });
    h.hook.mockReturnValue(state);
    const onSend = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(<LocationPicker open onOpenChange={onOpenChange} onSend={onSend} />);

    fireEvent.click(screen.getByRole('button', { name: /Enviar Localização/ }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith({ latitude: -23.5, longitude: -46.6, name: 'Rua A', address: 'Rua A, São Paulo' });
    expect(onSend.mock.calls[0][0]).not.toHaveProperty('isLive');
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(state.reset).toHaveBeenCalled();
  });

  it('se o envio falha, mantém o diálogo aberto e a seleção para nova tentativa', async () => {
    const state = hookState({ lat: -23.5, lng: -46.6 });
    h.hook.mockReturnValue(state);
    const onSend = vi.fn().mockRejectedValue(new Error('offline'));
    const onOpenChange = vi.fn();
    render(<LocationPicker open onOpenChange={onOpenChange} onSend={onSend} />);

    fireEvent.click(screen.getByRole('button', { name: /Enviar Localização/ }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(state.reset).not.toHaveBeenCalled();
  });
});
