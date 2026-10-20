import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

/**
 * E67 — integração do **segundo consumidor** do combobox de endereço (o picker do Inbox),
 * com o hook real e **só o `fetch` mockado** com os shapes reais do Apêndice A
 * (`docs/mapa/PLANO_BUSCA_SEARCHBOX_50_ETAPAS.md`).
 *
 * O que corre de verdade aqui: `useAddressAutocomplete`, o reducer de busca, `mapboxGeocode`
 * (`/suggest` → `/retrieve` → `/forward` + parsing do Apêndice A), `mapboxSession` (token de
 * sessão em localStorage), a `SuggestionList` e o `LocationPicker`. O que sai do caminho é só o
 * que NÃO é a resposta da Mapbox: o hook do mapa (`useLocationPicker`, que monta WebGL), o token
 * (Supabase) e a telemetria (Supabase/audit). Os shapes de rede vêm do `fetch` — antes o teste
 * de contato mockava as *funções* de `mapboxGeocode`, e com isso o parsing e o fallback não eram
 * exercitados.
 */

const h = vi.hoisted(() => ({
  hook: vi.fn(),
  fetch: vi.fn(),
  logAudit: vi.fn(),
  toast: vi.fn(),
}));

// A rede da Mapbox é o ÚNICO ponto de I/O mockado — o resto da camada roda real.
vi.stubGlobal('fetch', (...args: unknown[]) => h.fetch(...args));

vi.mock('../location-picker/useLocationPicker', () => ({ useLocationPicker: (...args: unknown[]) => h.hook(...args) }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: (...args: unknown[]) => h.toast(...args) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...args: unknown[]) => h.logAudit(...args) }));
// Borda Supabase (token e guarda de custo) — não é shape da Mapbox; sem mock não roda em jsdom.
vi.mock('@/lib/mapboxToken', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mapboxToken')>();
  return { ...actual, getMapboxToken: async () => 'tok', reportMapboxFailure: vi.fn() };
});
vi.mock('@/lib/mapboxCostGuard', () => ({ isSearchBudgetOk: () => true }));

const reduceMotion = vi.hoisted(() => ({ value: false }));
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reduceMotion.value };
});

import { LocationPicker } from '../LocationPicker';
import type { LocationOrigin } from '../location-picker/useLocationPicker';
import type { GeoSearchPlace } from '@/lib/mapboxGeocode';
import { resetSearchSessionForTests } from '@/lib/mapboxSession';
// E68: respostas reais da Mapbox em disco (Apêndice A) — o fetch destes testes serve estes arquivos.
import suggestXbz from '@/lib/__fixtures__/mapbox/suggest-xbz.json';
import suggestAsdkjh from '@/lib/__fixtures__/mapbox/suggest-asdkjh.json';
import retrieveXbz from '@/lib/__fixtures__/mapbox/retrieve-xbz-brindes.json';
import forwardAvenida from '@/lib/__fixtures__/mapbox/forward-avenida-paulista-1000.json';
import rateLimit429 from '@/lib/__fixtures__/mapbox/rate-limit-429.json';

// E68: os shapes do Apêndice A saíram daqui — vivem em `src/lib/__fixtures__/mapbox/*.json` e
// este arquivo (mais o do cadastro) lê o MESMO arquivo. Nenhum shape inline sobrou.
// `/suggest` NÃO traz coordenada (só mapbox_id/name/full_address/feature_type); `/retrieve/{id}`
// traz em `geometry.coordinates` como [lng, lat]; `/forward` (fallback) já vem COM coordenada —
// a seleção dispensa `/retrieve` (E15).

type Resp = { ok: boolean; status: number; json: () => Promise<unknown> };
function jsonResponse(body: unknown, status = 200): Resp {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** Roteia por endpoint, como o `fetch` real receberia. `undefined` = endpoint não esperado. */
function routeFetch(routes: { suggest?: unknown; retrieve?: unknown; forward?: unknown; v5?: unknown }) {
  h.fetch.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes('/search/searchbox/v1/suggest')) {
      return routes.suggest instanceof Error ? Promise.reject(routes.suggest) : Promise.resolve(routes.suggest);
    }
    if (u.includes('/search/searchbox/v1/retrieve/')) {
      return routes.retrieve instanceof Error ? Promise.reject(routes.retrieve) : Promise.resolve(routes.retrieve);
    }
    if (u.includes('/search/searchbox/v1/forward')) {
      return routes.forward instanceof Error ? Promise.reject(routes.forward) : Promise.resolve(routes.forward);
    }
    if (u.includes('/geocoding/v5/mapbox.places/')) {
      return routes.v5 instanceof Error ? Promise.reject(routes.v5) : Promise.resolve(routes.v5);
    }
    throw new Error(`fetch inesperado: ${u}`);
  });
}

const callsTo = (fragment: string) => h.fetch.mock.calls.filter(([u]) => String(u).includes(fragment));

interface Selected { lat: number; lng: number; name?: string; address?: string }
function hookState(selectedLocation: Selected | null, selectedOrigin: LocationOrigin | null = 'gps') {
  return {
    mapContainer: vi.fn(), isMapLoaded: false, mapError: null, retryMap: vi.fn(),
    isLoadingLocation: false, mapboxToken: 'tok', searchQuery: '', setSearchQuery: vi.fn(),
    isSearching: false, selectedLocation, selectedOrigin, searchResults: [],
    chooseSearchResult: vi.fn(), getCurrentLocation: vi.fn(), searchLocation: vi.fn(),
    reset: vi.fn(), proximity: undefined,
  };
}

/** Abre o picker na aba "Escolher no Mapa" (é ali que o combobox existe) com a lista aberta. */
async function renderOnMapTab(state = hookState(null)) {
  h.hook.mockReturnValue(state);
  render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);
  const mapTab = screen.getByRole('tab', { name: /Escolher no Mapa/ });
  fireEvent.click(mapTab);
  fireEvent.focus(mapTab);
  const input = await screen.findByRole('combobox');
  fireEvent.focusIn(input);
  return { input, state };
}

/** Digita e espera a lista refletir algo diferente de "idle" (debounce real de 300 ms). */
function digitar(input: HTMLElement, texto: string) {
  fireEvent.change(input, { target: { value: texto } });
}

beforeEach(() => {
  h.hook.mockReset();
  h.fetch.mockReset();
  h.logAudit.mockReset();
  h.toast.mockReset();
  // Cache de /suggest vive em closure de módulo e é chaveado pelo session_token: resetar a sessão
  // garante que cada caso exercite o fetch de verdade (mesmo termo não vem de cache do caso anterior).
  resetSearchSessionForTests();
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('E67 · integração do picker de endereço (hook real, só fetch mockado)', () => {
  it('1) /suggest com o shape do Apêndice A vira UMA opção com nome e endereço numa única request de sessão', async () => {
    const { input } = await renderOnMapTab();
    routeFetch({ suggest: jsonResponse(suggestXbz) });

    digitar(input, 'xbz');

    const option = await screen.findByRole('option', { name: /XBZ\s*Brindes/ });
    expect(within(option).getByText(/R\. da Independência/)).toBeInTheDocument();
    const suggest = callsTo('/search/searchbox/v1/suggest');
    expect(suggest).toHaveLength(1);
    // O billing é por sessão: o session_token tem de estar na URL (senão cada request seria avulsa).
    expect(String(suggest[0][0])).toContain('session_token=');
    expect(callsTo('/search/searchbox/v1/retrieve/')).toHaveLength(0);
  });

  it('2) escolher a sugestão aplica no mapa a coordenada do /retrieve (lng,lat do Apêndice A) com o endereço decomposto', async () => {
    const { input, state } = await renderOnMapTab();
    routeFetch({ suggest: jsonResponse(suggestXbz), retrieve: jsonResponse(retrieveXbz) });

    digitar(input, 'xbz');
    fireEvent.click(await screen.findByRole('option', { name: /XBZ\s*Brindes/ }));

    await waitFor(() => expect(state.chooseSearchResult).toHaveBeenCalledTimes(1));
    const place = state.chooseSearchResult.mock.calls[0][0] as GeoSearchPlace;
    // coordinates = [lng, lat] — inverter aqui colocaria o pino no oceano.
    expect(place.lng).toBeCloseTo(-46.61563441, 6);
    expect(place.lat).toBeCloseTo(-23.56672978, 6);
    expect(place.name).toBe('XBZ Brindes');
    expect(place.address).toBe('R. da Independência, São Paulo, 01524, Brazil');
    expect(place.components).toMatchObject({ city: 'São Paulo', stateCode: 'SP', postalCode: '01524-000' });
    expect(callsTo('/search/searchbox/v1/retrieve/')).toHaveLength(1);
  });

  it('3) /suggest cai por rede e o /forward real alimenta a lista com coordenada (sem /retrieve)', async () => {
    const { input, state } = await renderOnMapTab();
    routeFetch({ suggest: new TypeError('Failed to fetch'), forward: jsonResponse(forwardAvenida) });

    digitar(input, 'avenida paulista 1000');

    const option = await screen.findByRole('option', { name: /Avenida Paulista, 1000/ });
    // Sugestão vinda do /forward já tem ponto: selecionar NÃO pode gastar um /retrieve.
    fireEvent.click(option);

    await waitFor(() => expect(state.chooseSearchResult).toHaveBeenCalledTimes(1));
    const place = state.chooseSearchResult.mock.calls[0][0] as GeoSearchPlace;
    expect(place.lat).toBeCloseTo(-23.5613, 4);
    expect(place.lng).toBeCloseTo(-46.6565, 4);
    expect(callsTo('/search/searchbox/v1/retrieve/')).toHaveLength(0);
  });

  it('4) /retrieve responde 200 sem coordenada e a cascata E16 repete no /forward com o nome da sugestão', async () => {
    const { input, state } = await renderOnMapTab();
    routeFetch({
      suggest: jsonResponse(suggestXbz),
      // 200 sem `geometry.coordinates` = "não encontrado", não falha de rota.
      retrieve: jsonResponse({ features: [{ properties: { name: 'XBZ Brindes' } }] }),
      forward: jsonResponse(forwardAvenida),
    });

    digitar(input, 'xbz');
    fireEvent.click(await screen.findByRole('option', { name: /XBZ\s*Brindes/ }));

    await waitFor(() => expect(state.chooseSearchResult).toHaveBeenCalledTimes(1));
    const place = state.chooseSearchResult.mock.calls[0][0] as GeoSearchPlace;
    expect(place.lat).toBeCloseTo(-23.5613, 4);
    // A repetição foi com o texto da própria sugestão, não com o termo digitado.
    const forward = callsTo('/search/searchbox/v1/forward');
    expect(forward).toHaveLength(1);
    expect(decodeURIComponent(String(forward[0][0]))).toContain('XBZ Brindes');
  });

  it('5) ao escolher, a lista fecha e o anúncio do leitor de tela traz o nome escolhido (E64)', async () => {
    const { input } = await renderOnMapTab();
    routeFetch({ suggest: jsonResponse(suggestXbz), retrieve: jsonResponse(retrieveXbz) });

    digitar(input, 'xbz');
    fireEvent.click(await screen.findByRole('option', { name: /XBZ\s*Brindes/ }));

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    const anuncio = screen.getByTestId('sr-selecao');
    await waitFor(() => expect(anuncio).toHaveTextContent('Endereço escolhido: XBZ Brindes'));
    // O nome é da pessoa que escolhe, nunca telemetria (E64).
    expect(h.logAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'searchbox_selected', details: expect.objectContaining({ name: expect.anything() }) }));
  });

  it('6) /suggest e /retrieve da MESMA escolha compartilham o session_token (1 sessão = N /suggest + 1 /retrieve)', async () => {
    const { input } = await renderOnMapTab();
    routeFetch({ suggest: jsonResponse(suggestXbz), retrieve: jsonResponse(retrieveXbz) });

    digitar(input, 'xbz');
    fireEvent.click(await screen.findByRole('option', { name: /XBZ\s*Brindes/ }));

    await waitFor(() => expect(callsTo('/search/searchbox/v1/retrieve/')).toHaveLength(1));
    const tokenOf = (url: string) => new URL(url).searchParams.get('session_token');
    const suggestToken = tokenOf(String(callsTo('/search/searchbox/v1/suggest')[0][0]));
    const retrieveToken = tokenOf(String(callsTo('/search/searchbox/v1/retrieve/')[0][0]));
    expect(suggestToken).toBeTruthy();
    expect(retrieveToken).toBe(suggestToken);
    // country/language fixos do Apêndice A também são contrato da request.
    const suggestUrl = new URL(String(callsTo('/search/searchbox/v1/suggest')[0][0]));
    expect(suggestUrl.searchParams.get('country')).toBe('br');
    expect(suggestUrl.searchParams.get('language')).toBe('pt');
  });

  // E68 · os dois casos abaixo existem para que a fixture corresponda a um comportamento observável:
  // `suggest-asdkjh.json` (200 com `suggestions: []`) e `rate-limit-429.json`.
  it('7) /suggest 200 com lista vazia (fixture "asdkjh") mostra "Nada encontrado" e não seleciona nada (E25/E47)', async () => {
    const { input, state } = await renderOnMapTab();
    routeFetch({ suggest: jsonResponse(suggestAsdkjh) });

    digitar(input, 'asdkjh');

    expect(await screen.findByText(/Nada encontrado/)).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(state.chooseSearchResult).not.toHaveBeenCalled();
  });

  it('8) /suggest 429 (fixture rate-limit-429.json) pausa a lista com aviso e "Tentar novamente" (E27)', async () => {
    const { input } = await renderOnMapTab();
    routeFetch({ suggest: jsonResponse(rateLimit429, 429) });

    digitar(input, 'xbz');

    expect(await screen.findByText(/Sugestões pausadas por \d+ s/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    // Limite de uso não é falha de rota: a tela não pode dizer "Falha ao buscar sugestões".
    expect(screen.queryByText(/Falha ao buscar sugestões/)).not.toBeInTheDocument();
  });
});
