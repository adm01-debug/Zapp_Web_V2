import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  hook: vi.fn(),
  flag: vi.fn(),
  autocomplete: vi.fn(),
}));

vi.mock('../location-picker/useLocationPicker', () => ({ useLocationPicker: (...args: unknown[]) => h.hook(...args) }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: (...args: unknown[]) => h.flag(...args) }));
vi.mock('../location-picker/useAddressAutocomplete', () => ({ useAddressAutocomplete: (...args: unknown[]) => h.autocomplete(...args) }));

import { LocationPicker } from '../LocationPicker';

interface Selected { lat: number; lng: number; name?: string; address?: string }

function hookState(selectedLocation: Selected | null) {
  return {
    mapContainer: vi.fn(),
    isMapLoaded: false,
    mapError: null,
    retryMap: vi.fn(),
    isLoadingLocation: false,
    mapboxToken: 'tok',
    searchQuery: '',
    setSearchQuery: vi.fn(),
    isSearching: false,
    selectedLocation,
    searchResults: [],
    chooseSearchResult: vi.fn(),
    getCurrentLocation: vi.fn(),
    searchLocation: vi.fn(),
    reset: vi.fn(),
  };
}

// Estado inerte do hook de autocomplete — usado por padrão nos testes que não são sobre a
// Fase 3 (flag desligada é o caminho desses testes, então o hook nem chega a ser consultado
// pela UI, mas precisa existir porque o componente sempre o chama, feature flag ligada ou não).
function autocompleteState(overrides: Partial<ReturnType<typeof baseAutocomplete>> = {}) {
  return { ...baseAutocomplete(), ...overrides };
}
function baseAutocomplete() {
  return {
    query: '',
    setQuery: vi.fn(),
    suggestions: [] as Array<{ id: string; name: string; address: string; kind: string; distanceMeters?: number }>,
    isLoading: false,
    error: null as string | null,
    highlightedIndex: -1,
    retrievingId: null as string | null,
    select: vi.fn(),
    onKeyDown: vi.fn(),
    clear: vi.fn(),
  };
}

describe('LocationPicker', () => {
  it('não oferece localização em tempo real (o provedor só entrega localização pontual)', () => {
    h.hook.mockReturnValue(hookState(null));
    h.flag.mockReturnValue(false);
    h.autocomplete.mockReturnValue(autocompleteState());
    render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);
    expect(screen.getByText('Compartilhar Localização')).toBeInTheDocument();
    expect(screen.queryByText('Localização em tempo real')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('mantém "Enviar Localização" desabilitado sem seleção', () => {
    h.hook.mockReturnValue(hookState(null));
    h.flag.mockReturnValue(false);
    h.autocomplete.mockReturnValue(autocompleteState());
    render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Enviar Localização/ })).toBeDisabled();
  });

  it('envia só coordenadas, nome e endereço — sem o campo isLive — e fecha o diálogo', async () => {
    const state = hookState({ lat: -23.5, lng: -46.6, name: 'Rua A', address: 'Rua A, São Paulo' });
    h.hook.mockReturnValue(state);
    h.flag.mockReturnValue(false);
    h.autocomplete.mockReturnValue(autocompleteState());
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
    h.flag.mockReturnValue(false);
    h.autocomplete.mockReturnValue(autocompleteState());
    const onSend = vi.fn().mockRejectedValue(new Error('offline'));
    const onOpenChange = vi.fn();
    render(<LocationPicker open onOpenChange={onOpenChange} onSend={onSend} />);

    fireEvent.click(screen.getByRole('button', { name: /Enviar Localização/ }));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(state.reset).not.toHaveBeenCalled();
  });

  // Fase 3 (E27) — combobox de autocomplete, flag ligada, aba "Escolher no Mapa".
  describe('autocomplete de endereço (flag mapa.searchbox-autocomplete ligada)', () => {
    // Radix Tabs monta o conteúdo da aba num render posterior ao clique (mesmo motivo
    // documentado em useLocationPicker.ts) — por isso findByRole (com retry) em vez de getByRole.
    async function renderOnMapTab(state: ReturnType<typeof hookState>, ac: ReturnType<typeof autocompleteState>) {
      h.hook.mockReturnValue(state);
      h.flag.mockReturnValue(true);
      h.autocomplete.mockReturnValue(ac);
      render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);
      const mapTab = screen.getByRole('tab', { name: /Escolher no Mapa/ });
      // Radix Tabs troca de aba no foco (activationMode automático), não no click puro —
      // fireEvent.click não move o foco em jsdom como um clique real faria.
      fireEvent.click(mapTab);
      fireEvent.focus(mapTab);
      const input = await screen.findByRole('combobox');
      // Abre a lista: o componente só a renderiza com addressListOpen=true (foco ou digitação).
      fireEvent.focusIn(input);
      return input;
    }

    it('digitar 3 letras mostra a lista; clicar numa sugestão chama chooseSearchResult com a coordenada do /retrieve', async () => {
      const state = hookState(null);
      const place = { name: 'XBZ Brindes', address: 'R. da Independência, São Paulo', lat: -23.5, lng: -46.6 };
      const ac = autocompleteState({
        query: 'xbz',
        suggestions: [{ id: 'a', name: 'XBZ Brindes', address: 'R. da Independência, São Paulo', kind: 'poi' }],
        select: vi.fn().mockResolvedValue(place),
      });
      await renderOnMapTab(state, ac);

      fireEvent.click(screen.getByRole('option', { name: /^XBZ/ }));

      expect(ac.select).toHaveBeenCalledWith(0);
      await waitFor(() => expect(state.chooseSearchResult).toHaveBeenCalledWith(place));
    });

    it('falha do /retrieve (select devolve null) não chama chooseSearchResult', async () => {
      const state = hookState(null);
      const ac = autocompleteState({
        query: 'xbz',
        suggestions: [{ id: 'a', name: 'XBZ Brindes', address: 'SP', kind: 'poi' }],
        select: vi.fn().mockResolvedValue(null),
      });
      await renderOnMapTab(state, ac);

      fireEvent.click(screen.getByRole('option', { name: /^XBZ/ }));

      await waitFor(() => expect(ac.select).toHaveBeenCalledWith(0));
      expect(state.chooseSearchResult).not.toHaveBeenCalled();
    });

    it('navegação por teclado delega ao hook e Esc fecha a lista', async () => {
      const ac = autocompleteState({ query: 'xbz', suggestions: [{ id: 'a', name: 'XBZ Brindes', address: 'SP', kind: 'poi' }] });
      const input = await renderOnMapTab(hookState(null), ac);
      fireEvent.change(input, { target: { value: 'xbz' } });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(ac.onKeyDown).toHaveBeenCalled();
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(input).toHaveAttribute('aria-expanded', 'false');
    });

    it('expõe o padrão ARIA combobox + listbox + activedescendant', async () => {
      const ac = autocompleteState({ query: 'xbz', suggestions: [{ id: 'a', name: 'XBZ Brindes', address: 'SP', kind: 'poi' }], highlightedIndex: 0 });
      const input = await renderOnMapTab(hookState(null), ac);
      fireEvent.change(input, { target: { value: 'xbz' } });
      expect(input).toHaveAttribute('aria-autocomplete', 'list');
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      expect(input.getAttribute('aria-activedescendant')).toMatch(/-option-0$/);
    });

    it('renderiza a atribuição "Powered by Mapbox"', async () => {
      const ac = autocompleteState({ query: 'xbz', suggestions: [{ id: 'a', name: 'XBZ Brindes', address: 'SP', kind: 'poi' }] });
      const input = await renderOnMapTab(hookState(null), ac);
      fireEvent.change(input, { target: { value: 'xbz' } });
      expect(screen.getByRole('link', { name: /Mapbox/ })).toHaveAttribute('href', expect.stringContaining('mapbox.com'));
    });
  });
});
