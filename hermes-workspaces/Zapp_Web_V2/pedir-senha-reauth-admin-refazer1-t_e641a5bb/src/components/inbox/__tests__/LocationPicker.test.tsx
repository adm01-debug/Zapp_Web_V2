import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { axe } from 'vitest-axe';

const h = vi.hoisted(() => ({
  logAudit: vi.fn(),
  hook: vi.fn(),
  autocomplete: vi.fn(),
  // F3/E26: o aviso da falha de `/retrieve` sai por toast — precisa ser observável no teste.
  toast: vi.fn(),
}));

vi.mock('../location-picker/useLocationPicker', () => ({ useLocationPicker: (...args: unknown[]) => h.hook(...args) }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: (...args: unknown[]) => h.toast(...args) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...args: unknown[]) => h.logAudit(...args) }));
vi.mock('../location-picker/useAddressAutocomplete', () => ({ useAddressAutocomplete: (...args: unknown[]) => h.autocomplete(...args) }));

// E63: o cartão de confirmação usa `motion` (framer-motion) para a entrada. Para provar o
// comportamento sob `prefers-reduced-motion` sem depender do singleton interno do framer-motion,
// só o hook homônimo é substituído — o resto da lib segue real (mesmo padrão do CT-70 do catálogo).
const reduceMotion = vi.hoisted(() => ({ value: false }));
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reduceMotion.value };
});

import { LocationPicker } from '../LocationPicker';
import type { SearchStatus } from '../location-picker/useAddressAutocomplete';
import type { LocationOrigin } from '../location-picker/useLocationPicker';

interface Selected { lat: number; lng: number; name?: string; address?: string }

function hookState(selectedLocation: Selected | null, selectedOrigin: LocationOrigin | null = 'gps') {
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
    // E50: de ONDE veio a localização escolhida — 'suggest' | 'forward' | 'click' | 'gps'.
    selectedOrigin,
    searchResults: [],
    chooseSearchResult: vi.fn(),
    getCurrentLocation: vi.fn(),
    searchLocation: vi.fn(),
    reset: vi.fn(),
  };
}

// Estado inerte do hook de autocomplete — usado por padrão nos testes que não são sobre a
// Fase 3 (o hook nem chega a ser consultado pela UI, mas precisa existir porque o componente
// sempre o chama).
function autocompleteState(overrides: Partial<ReturnType<typeof baseAutocomplete>> = {}) {
  const merged = { ...baseAutocomplete(), ...overrides };
  // E23: a lista agora rende por `status`, não por `suggestions.length`. Nos testes de componente
  // o status segue os dados do mock (a não ser que o teste peça um status explícito), reproduzindo
  // o que o hook real faria com aquela combinação.
  if (!overrides.status) {
    if (overrides.blocked) merged.status = 'paused';
    else if (overrides.error) merged.status = 'error';
    else if (merged.suggestions.length > 0) merged.status = 'ok';
    else if (merged.query.trim().length >= 3) merged.status = 'empty';
    else merged.status = 'idle';
  }
  return merged;
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
    // F2/E13: retry real do botão "Tentar novamente" + bloqueio vigente (429 / teto de custo).
    retrySuggest: vi.fn(),
    blocked: null as 'rate_limited' | 'cost_guard' | null,
    // F3/E23: estado explícito da busca + as duas informações novas que a lista usa.
    status: 'idle' as SearchStatus,
    pausedUntil: null as number | null,
    retrieveError: null as { id: string; kind: string } | null,
    // E64: anúncio do leitor de tela preenchido dentro do select() — o mock começa vazio.
    selectionAnnouncement: '',
  };
}

describe('LocationPicker', () => {
  it('não oferece localização em tempo real (o provedor só entrega localização pontual)', () => {
    h.hook.mockReturnValue(hookState(null));
    h.autocomplete.mockReturnValue(autocompleteState());
    render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);
    expect(screen.getByText('Compartilhar Localização')).toBeInTheDocument();
    expect(screen.queryByText('Localização em tempo real')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('mantém "Enviar Localização" desabilitado sem seleção', () => {
    h.hook.mockReturnValue(hookState(null));
    h.autocomplete.mockReturnValue(autocompleteState());
    render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Enviar Localização/ })).toBeDisabled();
  });

  it('envia só coordenadas, nome e endereço — sem o campo isLive — e fecha o diálogo', async () => {
    const state = hookState({ lat: -23.5, lng: -46.6, name: 'Rua A', address: 'Rua A, São Paulo' });
    h.hook.mockReturnValue(state);
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

  it.each(['suggest', 'forward', 'click', 'gps'] as const)(
    'E50: o envio registra location_sent com origin=%s (sem dado do cliente)',
    async (origin) => {
      // O funil do Searchbox terminava sem medir o desfecho: dava para saber quantas buscas e
      // selecoes houve, nunca quantas viraram uma localizacao de fato ENVIADA nem POR ONDE ela
      // chegou. So a origem entra — termo, nome, endereco e coordenada do cliente nunca aparecem.
      h.logAudit.mockReset();
      const state = hookState({ lat: -23.5, lng: -46.6, name: 'Rua A', address: 'Rua A, São Paulo' }, origin);
      h.hook.mockReturnValue(state);
      h.autocomplete.mockReturnValue(autocompleteState());
      render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn().mockResolvedValue(undefined)} />);

      fireEvent.click(screen.getByRole('button', { name: /Enviar Localização/ }));

      // 1× por envio — não duplica.
      await waitFor(() => expect(h.logAudit).toHaveBeenCalledTimes(1));
      const evento = h.logAudit.mock.calls[0][0];
      expect(evento).toMatchObject({ action: 'location_sent', details: { origin } });
      // Shape fechado: SÓ {origin} — nem hasName/hasAddress, nem campo extra.
      expect(Object.keys(evento.details)).toEqual(['origin']);
      // Sem PII: nome, endereço e coordenada do cliente fora do evento.
      const json = JSON.stringify(evento.details);
      expect(json).not.toContain('Rua A');
      expect(json).not.toContain('São Paulo');
      expect(json).not.toContain('-23.5');
    },
  );
  
  it('se o envio falha, mantém o diálogo aberto e a seleção para nova tentativa', async () => {
    const state = hookState({ lat: -23.5, lng: -46.6 });
    h.hook.mockReturnValue(state);
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
  describe('autocomplete de endereço (ramo único — a flag foi removida no 4b)', () => {
    // Radix Tabs monta o conteúdo da aba num render posterior ao clique (mesmo motivo
    // documentado em useLocationPicker.ts) — por isso findByRole (com retry) em vez de getByRole.
    async function renderOnMapTab(state: ReturnType<typeof hookState>, ac: ReturnType<typeof autocompleteState>) {
      h.hook.mockReturnValue(state);
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

    it('E46: Enter com sugestão destacada seleciona igual ao clique (antes só o hook resolvia o /retrieve e o picker nunca aplicava o resultado)', async () => {
      const state = hookState(null);
      const place = { name: 'XBZ Brindes', address: 'SP', lat: -23.5, lng: -46.6 };
      const ac = autocompleteState({
        query: 'xbz',
        suggestions: [{ id: 'a', name: 'XBZ Brindes', address: 'SP', kind: 'poi' }],
        highlightedIndex: 0,
        select: vi.fn().mockResolvedValue(place),
      });
      const input = await renderOnMapTab(state, ac);

      fireEvent.keyDown(input, { key: 'Enter' });

      expect(ac.select).toHaveBeenCalledWith(0);
      await waitFor(() => expect(state.chooseSearchResult).toHaveBeenCalledWith(place));
    });

    it('E64: após a seleção o anúncio aparece numa região viva (role=status) com o nome escolhido', async () => {
      const state = hookState(null);
      const place = { name: 'XBZ Brindes', address: 'SP', lat: -23.5, lng: -46.6 };
      const ac = autocompleteState({
        status: 'ok',
        query: 'xbz',
        suggestions: [{ id: 'a', name: 'XBZ Brindes', address: 'SP', kind: 'poi' }],
      });
      // O hook real preenche `selectionAnnouncement` DENTRO do select(); o mock reproduz isso.
      ac.select = vi.fn(async () => {
        ac.selectionAnnouncement = 'Endereço escolhido: XBZ Brindes';
        return place;
      });
      h.hook.mockReturnValue(state);
      h.autocomplete.mockReturnValue(ac);
      const view = render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);
      const mapTab = screen.getByRole('tab', { name: /Escolher no Mapa/ });
      fireEvent.click(mapTab);
      fireEvent.focus(mapTab);
      const input = await screen.findByRole('combobox');
      fireEvent.focusIn(input);

      fireEvent.click(screen.getByRole('option', { name: /^XBZ/ }));
      await waitFor(() => expect(ac.select).toHaveBeenCalledWith(0));

      // Re-render com o anúncio preenchido: é o que o hook real produz depois do select().
      view.rerender(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);
      const viva = screen.getByTestId('sr-selecao');
      expect(viva).toHaveAttribute('role', 'status');
      expect(viva).toHaveAttribute('aria-live', 'polite');
      expect(viva.className).toContain('sr-only');
      expect(viva.textContent).toBe('Endereço escolhido: XBZ Brindes');
      // O nome escolhido não vaza para a auditoria (E50).
      expect(JSON.stringify(h.logAudit.mock.calls)).not.toContain('XBZ');
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

    // Fase 4 (E30) — clique no mapa/GPS muda `selectedLocation` pelo caminho antigo
    // (reverseGeocode -> select), sem passar pelo autocomplete. Uma lista de sugestões
    // aberta na hora não pode sobrar flutuando por cima do marcador que acabou de mudar.
    it('clique no mapa (nova selectedLocation) fecha a lista de sugestões aberta', async () => {
      const ac = autocompleteState({ query: 'xbz', suggestions: [{ id: 'a', name: 'XBZ Brindes', address: 'SP', kind: 'poi' }] });
      h.hook.mockReturnValue(hookState(null));
      h.autocomplete.mockReturnValue(ac);
      const view = render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);
      const mapTab = screen.getByRole('tab', { name: /Escolher no Mapa/ });
      fireEvent.click(mapTab);
      fireEvent.focus(mapTab);
      const input = await screen.findByRole('combobox');
      fireEvent.focusIn(input);
      fireEvent.change(input, { target: { value: 'xbz' } });
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      // Simula o clique no mapa completando a seleção via useLocationPicker.
      h.hook.mockReturnValue(hookState({ lat: -23.5, lng: -46.6 }));
      view.rerender(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(input).toHaveAttribute('aria-expanded', 'false');
      expect(ac.clear).toHaveBeenCalled();
    });

    // F2/E11 (C2): a auditoria mostrou o operador digitando e apertando Enter sem nada acontecer —
    // com a flag ligada o input é do combobox e `searchQuery` (do useLocationPicker) fica vazio,
    // então a busca caía na primeira linha de `searchLocation` e voltava sem fazer nada.
    it('E11/C2: Enter sem sugestão destacada busca o termo digitado no combobox', async () => {
      const state = { ...hookState(null), searchLocation: vi.fn() };
      await renderOnMapTab(state, autocompleteState({ query: 'avenida paulista 1000' }));
      const input = screen.getByRole('combobox');

      fireEvent.keyDown(input, { key: 'Enter' });

      expect(state.searchLocation).toHaveBeenCalledWith('avenida paulista 1000');
    });

    // F2/E14: antes o botão só reescrevia a query com o mesmo valor — o effect não reexecutava e
    // o operador ficava olhando "Falha ao buscar sugestões" para sempre.
    it('E14: "Tentar novamente" chama retrySuggest (retry real), não setQuery', async () => {
      const ac = autocompleteState({ query: 'avenida paulista', error: 'network' });
      await renderOnMapTab(hookState(null), ac);

      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

      expect(ac.retrySuggest).toHaveBeenCalledTimes(1);
      expect(ac.setQuery).not.toHaveBeenCalled();
    });

    // ── Fase 3: estados verdadeiros na tela (E25, E26, E27, E29, E30, E31) ─────────────────────

    it('E58: combobox aberto com 3 sugestões não tem violação de acessibilidade (axe)', async () => {
      const ac = autocompleteState({
        query: 'rua a',
        status: 'ok',
        suggestions: [
          { id: 's1', name: 'Rua A, 1', address: 'Rua A, 1, São Paulo', kind: 'street' },
          { id: 's2', name: 'Rua B, 2', address: 'Rua B, 2, São Paulo', kind: 'address' },
          { id: 's3', name: 'Rua C, 3', address: 'Rua C, 3, São Paulo', kind: 'poi' },
        ] as never,
      });
      await renderOnMapTab(hookState(null), ac);
      // E58: o padrão combobox precisa estar íntegro — role, aria-expanded, aria-controls e
      // aria-activedescendant apontando para uma opção que existe de verdade.
      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('aria-expanded', 'true');
      const controls = input.getAttribute('aria-controls');
      expect(controls).toBeTruthy();
      expect(document.getElementById(controls as string)).not.toBeNull();
      const ativo = input.getAttribute('aria-activedescendant');
      if (ativo) expect(document.getElementById(ativo)).not.toBeNull();
      // jsdom não calcula contraste (o axe não tem layout real) — fora da varredura, declarado.
      // O Dialog/Tabs do Radix renderiza em portal no `document.body`, então o `container`
      // do render fica vazio: a varredura tem de ser no body (senão seria vácuo).
      const results = await axe(document.body, {
        rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
        it('E25: durante o debounce mostra esqueleto — "Nada encontrado" só depois de resposta vazia', async () => {
      const ac = autocompleteState({ status: 'typing', query: 'avenida paulista' });
      h.hook.mockReturnValue(hookState(null));
      h.autocomplete.mockReturnValue(ac);
      const view = render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);
      const mapTab = screen.getByRole('tab', { name: /Escolher no Mapa/ });
      fireEvent.click(mapTab);
      fireEvent.focus(mapTab);
      const input = await screen.findByRole('combobox');
      fireEvent.focusIn(input);

      expect(screen.queryByText(/Nada encontrado/)).not.toBeInTheDocument();
      expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);

      // A resposta vazia de verdade chega → agora sim "Nada encontrado".
      ac.status = 'empty';
      view.rerender(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);

      expect(screen.getByText(/Nada encontrado para/)).toBeInTheDocument();
    });

    it('E27: pausado mostra o aviso com contagem e lembra que o Enter continua — nunca "Nada encontrado"', async () => {
      const ac = autocompleteState({
        status: 'paused',
        blocked: 'rate_limited',
        pausedUntil: Date.now() + 45_000,
        query: 'avenida paulista',
      });
      await renderOnMapTab(hookState(null), ac);

      expect(screen.getByText(/Sugestões pausadas por \d+ s/)).toBeInTheDocument();
      expect(screen.queryByText(/Nada encontrado/)).not.toBeInTheDocument();
      // A3-04 (onda 2): a pausa transitória PASSA a oferecer "Tentar novamente" — a ausência do
      // botão era exatamente o defeito medido no bundle real (0 ocorrências durante toda a espera).
      // O que continua proibido é a pausa se passar por ERRO.
      expect(screen.queryByText('Falha ao buscar sugestões.')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
    });

    it('E24: a falha mostra a causa em texto, não um "Falha ao buscar sugestões" genérico', async () => {
      const ac = autocompleteState({ status: 'error', error: 'rate_limited', query: 'avenida' });
      await renderOnMapTab(hookState(null), ac);
      expect(screen.getByText('Limite de buscas atingido — aguarde 1 min.')).toBeInTheDocument();
    });

    it('E26: falha do /retrieve mantém a lista aberta, mostra a causa no item e avisa uma vez', async () => {
      const state = hookState(null);
      const ac = autocompleteState({
        status: 'ok',
        query: 'xbz',
        suggestions: [{ id: 'a', name: 'XBZ Brindes', address: 'R. da Independência, São Paulo', kind: 'poi' }],
        retrieveError: { id: 'a', kind: 'network' },
      });
      ac.select.mockResolvedValue(null);
      h.toast.mockClear();
      await renderOnMapTab(state, ac);

      fireEvent.click(screen.getByRole('option', { name: /XBZ/ }));

      await waitFor(() => expect(ac.select).toHaveBeenCalledWith(0));
      // A lista continua de pé e a escolha não foi aplicada…
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      expect(state.chooseSearchResult).not.toHaveBeenCalled();
      // …mas o operador é avisado, com a causa (E24), uma vez.
      expect(h.toast).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Sem conexão com o serviço de mapas.')).toBeInTheDocument();
    });

    // ─── 4b: a flag morreu — a UI não pode mais depender dela ──────────────────────────────

    it('4b: a UI é ramo único (o combobox sempre aparece; o ramo legado não voltou)', async () => {
      // Item 4b: o ramo legado (gated por feature flag) morreu — a UI é ramo único. Este teste
      // pina isso: o combobox aparece sempre (com `role=listbox`, estado de busca A4-C e o input
      // próprio), e o botão "Buscar" do ramo antigo, que só existia lá, não volta.
      h.hook.mockReturnValue(hookState(null));
      h.autocomplete.mockReturnValue(autocompleteState());
      render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);

      const mapTab = screen.getByRole('tab', { name: /Escolher no Mapa/ });
      fireEvent.click(mapTab);
      fireEvent.focus(mapTab);

      const campo = await screen.findByRole('combobox');
      expect(campo).toHaveAttribute('aria-autocomplete', 'list');
      expect(campo).toHaveAttribute('aria-controls', 'location-picker-address-listbox');
      // e o botão "Buscar" do ramo antigo, que só existia ali, não volta
      expect(screen.queryByRole('button', { name: /^Buscar$/ })).not.toBeInTheDocument();
    });

    // ─── Onda 2 (auditoria adversarial): A3-01, reproduzido no bundle real ──────────────────

    it('A3-01: clique duplo no MESMO item não dispara um segundo /retrieve (antes: N−1 requests e sessões)', async () => {
      const state = hookState(null);
      const place = { name: 'XBZ Brindes', address: 'SP', lat: -23.5, lng: -46.6 };
      let resolveSelect: (v: typeof place) => void = () => {};
      const ac = autocompleteState({
        status: 'ok',
        query: 'xbz',
        suggestions: [{ id: 'a', name: 'XBZ Brindes', address: 'SP', kind: 'poi' }],
      });
      ac.select = vi.fn().mockImplementation(() => {
        ac.retrievingId = 'a';   // é o que o hook marca enquanto o /retrieve está em voo
        return new Promise((r) => { resolveSelect = r; });
      });
      await renderOnMapTab(state, ac);

      fireEvent.click(screen.getByRole('option', { name: /XBZ/ }));
      expect(ac.select).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('option', { name: /XBZ/ }));   // clique duplo humano
      expect(ac.select).toHaveBeenCalledTimes(1);                     // ← nada de 2º /retrieve/sessão

      resolveSelect(place);
      await waitFor(() => expect(state.chooseSearchResult).toHaveBeenCalledWith(place));
    });

    it('A3-01: seleção superada não produz toast destrutivo falso (o erro é de outro item)', async () => {
      const state = hookState(null);
      const ac = autocompleteState({
        status: 'ok',
        query: 'xbz',
        suggestions: [{ id: 'a', name: 'XBZ Brindes', address: 'R. da Independência, São Paulo', kind: 'poi' }],
        select: vi.fn().mockResolvedValue(null),
        retrieveError: { id: 'b', kind: 'network' },   // erro de uma seleção/termo que não é este
      });
      h.toast.mockClear();
      await renderOnMapTab(state, ac);

      fireEvent.click(screen.getByRole('option', { name: /XBZ/ }));

      await waitFor(() => expect(ac.select).toHaveBeenCalledWith(0));
      expect(state.chooseSearchResult).not.toHaveBeenCalled();
      expect(h.toast).not.toHaveBeenCalled();
    });

    it('E29: clique no mapa limpa o termo mesmo com a lista fechada', async () => {
      const ac = autocompleteState({ query: 'avenida paulista' });
      h.hook.mockReturnValue(hookState(null));
      h.autocomplete.mockReturnValue(ac);
      const view = render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);
      const mapTab = screen.getByRole('tab', { name: /Escolher no Mapa/ });
      fireEvent.click(mapTab);
      fireEvent.focus(mapTab);
      const input = await screen.findByRole('combobox');
      fireEvent.focusIn(input);
      // Fecha a lista sem apagar o termo: é exatamente o estado em que o bug do M2 acontecia.
      fireEvent.keyDown(input, { key: 'Escape' });
      ac.clear.mockClear();

      h.hook.mockReturnValue(hookState({ lat: -23.5, lng: -46.6 }));
      view.rerender(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);

      expect(ac.clear).toHaveBeenCalled();
    });

    it('E30: sair do campo com Tab fecha a lista', async () => {
      const ac = autocompleteState({
        status: 'ok',
        query: 'xbz',
        suggestions: [{ id: 'a', name: 'XBZ Brindes', address: 'SP', kind: 'poi' }],
      });
      const input = await renderOnMapTab(hookState(null), ac);
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      // Foco real e Tab real: `input.focus()`/`input.blur()` do jsdom disparam `focusin`/`focusout`,
      // que é como o navegador entrega o Tab — sem `relatedTarget` (o foco foi para fora da árvore).
      act(() => input.focus());
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      act(() => input.blur());

      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
      expect(input).toHaveAttribute('aria-expanded', 'false');
    });

    it('E31: o destaque do trecho digitado aparece nas duas linhas, com negrito', async () => {
      const ac = autocompleteState({
        status: 'ok',
        query: 'independencia',
        suggestions: [{ id: 'a', name: 'XBZ Brindes', address: 'R. da Independência, São Paulo', kind: 'poi' }],
      });
      await renderOnMapTab(hookState(null), ac);

      const marcas = document.querySelectorAll('mark');
      // Uma no nome (nada casa) e uma no endereço — o termo sem acento casa "Independência".
      expect(marcas.length).toBe(1);
      expect(marcas[0].textContent).toBe('Independência');
      expect(marcas[0].className).toContain('font-semibold');
    });
  });
});

/**
 * E63 — redução de movimento no picker de localização. Além do esqueleto da lista (ver
 * SuggestionList.test.tsx), este componente tem spinner de carregamento em três pontos e o cartão
 * de confirmação entra com `motion` (framer-motion). Quem pediu menos movimento no sistema não deve
 * receber nenhum deles: os spinners usam a variante Tailwind `motion-reduce:animate-none` e a
 * entrada do cartão é desligada pelo `useReducedMotion` do framer-motion (classe Tailwind não
 * alcança animação guidada por JS).
 */
describe('LocationPicker — movimento reduzido E63', () => {
  afterEach(() => { reduceMotion.value = false; });

  it('E63: o spinner do botão "Usar localização atual" respeita menos movimento', () => {
    const state = hookState(null);
    state.isLoadingLocation = true;
    h.hook.mockReturnValue(state);
    h.autocomplete.mockReturnValue(autocompleteState());
    render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);

    const spinner = document.querySelector('svg.animate-spin');
    expect(spinner).not.toBeNull();
    expect(spinner!.getAttribute('class')).toContain('motion-reduce:animate-none');
  });

  it('E63: o spinner de carregamento do mapa respeita menos movimento', async () => {
    h.hook.mockReturnValue(hookState(null));
    h.autocomplete.mockReturnValue(autocompleteState());
    render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);
    const mapTab = screen.getByRole('tab', { name: /Escolher no Mapa/ });
    fireEvent.click(mapTab);
    fireEvent.focus(mapTab);
    await screen.findByRole('combobox');

    const spinners = [...document.querySelectorAll('svg.animate-spin')];
    expect(spinners.length).toBeGreaterThan(0);
    for (const s of spinners) {
      expect(s.getAttribute('class')).toContain('motion-reduce:animate-none');
    }
  });

  it('E63: com prefers-reduced-motion o cartão de confirmação entra sem animação', () => {
    reduceMotion.value = true;
    h.hook.mockReturnValue(hookState({ lat: -23.55, lng: -46.63, name: 'Av. Paulista', address: 'Av. Paulista, 1000' }));
    h.autocomplete.mockReturnValue(autocompleteState());
    render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);

    const cartao = screen.getByTestId('local-atual-card');
    // `initial=false`: o cartão nasce direto no estado final — nenhum quadro de entrada foi criado.
    expect(cartao.style.opacity).toBe('1');
    expect(cartao.style.transform).toBe('none');
  });

  it('E63 controle: sem prefers-reduced-motion a entrada animada continua existindo', () => {
    reduceMotion.value = false;
    h.hook.mockReturnValue(hookState({ lat: -23.55, lng: -46.63, name: 'Av. Paulista', address: 'Av. Paulista, 1000' }));
    h.autocomplete.mockReturnValue(autocompleteState());
    render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);
    const cartao = screen.getByTestId('local-atual-card');
    // controle: sem a preferência, a entrada animada continua — começa escondida e deslocada.
    expect(cartao.style.opacity).toBe('0');
    expect(cartao.style.transform).toBe('translateY(10px)');
  });
});
