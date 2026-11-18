import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

/**
 * Envio duplicado da localização — 409 da `message-delivery` no console de producao.
 *
 * O botão "Enviar Localização" ficava habilitado durante o `await onSend(...)`. Dois ou três
 * cliques disparavam envios CONCORRENTES da mesma mensagem; a trava de idempotência da edge
 * `message-delivery` devolvia `409` para o segundo e o terceiro, e o operador via
 * "O envio desta mensagem já está em andamento" num envio que tinha dado certo.
 *
 * Evidência do console de producao (18/11, sessão d7dcc943): três
 * `POST /functions/v1/message-delivery 409` com `cid` distintos (`req_4`, `req_5`, `req_6`),
 * todos a partir de `LocationPicker` → `ChatPanel` → `outbound-message.service`.
 *
 * O que este teste prova:
 * 1. três cliques seguidos chamam `onSend` UMA vez;
 * 2. enquanto o envio está em voo o botão fica desabilitado, com `aria-busy` e rótulo "Enviando...";
 * 3. envio que falha devolve o botão ao estado normal, para o operador tentar de novo.
 */

const h = vi.hoisted(() => ({
  logAudit: vi.fn(),
  hook: vi.fn(),
  autocomplete: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('../location-picker/useLocationPicker', () => ({ useLocationPicker: (...args: unknown[]) => h.hook(...args) }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: (...args: unknown[]) => h.toast(...args) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...args: unknown[]) => h.logAudit(...args) }));
vi.mock('../location-picker/useAddressAutocomplete', () => ({ useAddressAutocomplete: (...args: unknown[]) => h.autocomplete(...args) }));

import { LocationPicker } from '../LocationPicker';

function hookState() {
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
    selectedLocation: { lat: -23.5, lng: -46.6, name: 'Ponto', address: 'Rua X, 1' },
    selectedOrigin: 'gps' as const,
    searchResults: [],
    chooseSearchResult: vi.fn(),
    getCurrentLocation: vi.fn(),
    searchLocation: vi.fn(),
    reset: vi.fn(),
    proximity: null,
  };
}

function autocompleteInerte() {
  return {
    query: '',
    setQuery: vi.fn(),
    suggestions: [] as Array<{ id: string; name: string; address: string; kind: string }>,
    isLoading: false,
    error: null as string | null,
    highlightedIndex: -1,
    retrievingId: null as string | null,
    select: vi.fn(),
    onKeyDown: vi.fn(),
    clear: vi.fn(),
    retrySuggest: vi.fn(),
    blocked: null,
    status: 'idle' as const,
    pausedUntil: null as number | null,
    retrieveError: null as { id: string; kind: string } | null,
  };
}

function botaoEnviar() {
  return screen.getByRole('button', { name: /enviar localiza|enviando/i });
}

afterEach(() => { vi.clearAllMocks(); });

describe('LocationPicker — envio concorrente', () => {
  it('três cliques seguidos enviam UMA vez', async () => {
    h.hook.mockReturnValue(hookState());
    h.autocomplete.mockReturnValue(autocompleteInerte());

    let liberar: (() => void) | null = null;
    const onSend = vi.fn(() => new Promise<void>((resolve) => { liberar = resolve; }));

    render(<LocationPicker open onOpenChange={vi.fn()} onSend={onSend} />);

    const botao = botaoEnviar();
    fireEvent.click(botao);
    fireEvent.click(botao);
    fireEvent.click(botao);

    expect(onSend).toHaveBeenCalledTimes(1);

    // Em voo: desabilitado, aria-busy e rótulo de progresso.
    await waitFor(() => expect(botaoEnviar()).toBeDisabled());
    expect(botaoEnviar().getAttribute('aria-busy')).toBe('true');
    expect(botaoEnviar().textContent).toMatch(/enviando/i);

    await act(async () => { liberar?.(); });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('envio que falha devolve o botão para o operador tentar de novo', async () => {
    h.hook.mockReturnValue(hookState());
    h.autocomplete.mockReturnValue(autocompleteInerte());

    const onSend = vi.fn().mockRejectedValue(new Error('rede caiu'));
    render(<LocationPicker open onOpenChange={vi.fn()} onSend={onSend} />);

    await act(async () => { fireEvent.click(botaoEnviar()); });

    await waitFor(() => expect(botaoEnviar()).not.toBeDisabled());
    expect(botaoEnviar().textContent).toMatch(/enviar localiza/i);
    expect(h.logAudit).not.toHaveBeenCalled();

    // E agora um novo clique chega ao handler (a guarda não ficou travada).
    await act(async () => { fireEvent.click(botaoEnviar()); });
    expect(onSend).toHaveBeenCalledTimes(2);
  });
});
