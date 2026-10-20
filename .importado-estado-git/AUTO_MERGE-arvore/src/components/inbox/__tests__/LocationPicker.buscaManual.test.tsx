import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

/**
 * R2-INB-039 (item #333) — **busca manual** de localização (Enter sem sugestão destacada).
 *
 * O caminho degradado obrigatório (E37: com o autocomplete pausado a UI orienta "use o Enter")
 * chama `searchLocation()` do `useLocationPicker`, que com VÁRIOS candidatos só preenchia
 * `searchResults` — e o `LocationPicker` não consumia esse estado. Resultado: os candidatos
 * existiam no hook e não apareciam para o operador escolher; sem ponto anterior, o botão
 * "Enviar Localização" continuava desabilitado.
 *
 * Aqui os DOIS hooks são os de verdade (`useLocationPicker` + `useAddressAutocomplete`) e o
 * único I/O mockado é a rede da Mapbox — o caminho testado é o que a tela usa. Clicar num
 * candidato do hook por fora (como fazia o teste de hook) não prova alcançabilidade: este
 * teste tem de passar pelo DOM.
 */

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  logAudit: vi.fn(),
  toast: vi.fn(),
  loadMapbox: vi.fn(),
}));

// A rede da Mapbox é o ÚNICO ponto de I/O mockado.
vi.stubGlobal('fetch', (...args: unknown[]) => h.fetch(...args));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: (...args: unknown[]) => h.toast(...args) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...args: unknown[]) => h.logAudit(...args) }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('@/lib/errorReporter', () => ({ reportClientError: vi.fn() }));
vi.mock('@/lib/mapboxLoader', () => ({ loadMapbox: () => h.loadMapbox() }));
vi.mock('@/lib/mapboxToken', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mapboxToken')>();
  return { ...actual, getMapboxToken: async () => 'tok', reportMapboxFailure: vi.fn() };
});
vi.mock('@/lib/mapboxCostGuard', () => ({ isSearchBudgetOk: () => true }));

import { LocationPicker } from '../LocationPicker';
import { resetSearchSessionForTests } from '@/lib/mapboxSession';
import rateLimit429 from '@/lib/__fixtures__/mapbox/rate-limit-429.json';
import suggestXbz from '@/lib/__fixtures__/mapbox/suggest-xbz.json';
import retrieveXbz from '@/lib/__fixtures__/mapbox/retrieve-xbz-brindes.json';

type Handler = (event?: unknown) => void;

class FakeMap {
  static instances: FakeMap[] = [];
  opts: { center: [number, number]; zoom: number };
  handlers = new Map<string, Handler[]>();
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
  remove() { this.handlers.clear(); }
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

type Resp = { ok: boolean; status: number; json: () => Promise<unknown> };
function jsonResponse(body: unknown, status = 200): Resp {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** Roteia por endpoint, como o `fetch` real receberia. */
function routeFetch(routes: { suggest?: Resp; retrieve?: Resp; forward?: Resp; v5?: Resp }) {
  h.fetch.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes('/search/searchbox/v1/suggest')) return Promise.resolve(routes.suggest);
    if (u.includes('/search/searchbox/v1/retrieve/')) return Promise.resolve(routes.retrieve);
    if (u.includes('/search/searchbox/v1/forward')) return Promise.resolve(routes.forward);
    if (u.includes('/geocoding/v5/mapbox.places/')) return Promise.resolve(routes.v5 ?? jsonResponse({ features: [] }));
    throw new Error(`fetch inesperado: ${u}`);
  });
}

// Shape do `/forward` (Apêndice A): já vem COM coordenada — a seleção dispensa `/retrieve`.
const TRES_CANDIDATOS = {
  features: [
    { geometry: { coordinates: [-46.62, -23.57] }, properties: { name: 'XBZ Brindes', full_address: 'R. da Independência, São Paulo' } },
    { geometry: { coordinates: [-49.27, -25.43] }, properties: { name: 'Brindes Curitiba', full_address: 'Curitiba - PR' } },
    { geometry: { coordinates: [-40.36, -20.37] }, properties: { name: 'Brendes', full_address: 'Vila Velha - ES' } },
  ],
};

const UM_CANDIDATO = { features: [TRES_CANDIDATOS.features[1]] };

/** Abre o picker na aba do mapa, com o mapa falso carregado (é ali que o combobox existe). */
async function abrirNoMapa() {
  render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);
  const mapTab = screen.getByRole('tab', { name: /Escolher no Mapa/ });
  fireEvent.click(mapTab);
  fireEvent.focus(mapTab);
  const input = await screen.findByRole('combobox');
  fireEvent.focusIn(input);
  await waitFor(() => expect(FakeMap.instances).toHaveLength(1));
  act(() => FakeMap.instances[0].emit('load'));
  return input;
}

/** Digita o termo e confirma a busca manual (Enter sem sugestão destacada). */
async function buscarManual(input: HTMLElement, termo: string) {
  fireEvent.change(input, { target: { value: termo } });
  // Durante a pausa (429 no /suggest) a lista orienta exatamente este Enter — é o caminho
  // degradado em que a falha era mais visível.
  await screen.findByText(/Sugestões pausadas por \d+ s/);
  fireEvent.keyDown(input, { key: 'Enter' });
}

beforeEach(() => {
  h.fetch.mockReset();
  h.logAudit.mockReset();
  h.toast.mockReset();
  h.loadMapbox.mockReset();
  h.loadMapbox.mockResolvedValue(fakeMapbox);
  FakeMap.instances = [];
  FakeMarker.instances = [];
  resetSearchSessionForTests();
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('R2-INB-039 · candidatos da busca manual no picker de localização', () => {
  it('vários candidatos: os três aparecem para escolha e só o clicado vira seleção', async () => {
    routeFetch({ suggest: jsonResponse(rateLimit429, 429), forward: jsonResponse(TRES_CANDIDATOS) });
    const input = await abrirNoMapa();

    await buscarManual(input, 'brindes curitiba');

    // O defeito: sem a correção a tela não mostra nada — `searchResults` ficava sem consumidor.
    const opcoes = await screen.findAllByRole('option');
    expect(opcoes).toHaveLength(3);
    expect(screen.getByRole('option', { name: /Brindes Curitiba/ })).toBeInTheDocument();
    // Nada é aplicado sozinho: com vários candidatos quem decide é o operador.
    expect(screen.getByRole('button', { name: /Enviar Localização/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('option', { name: /Brindes Curitiba/ }));

    await waitFor(() => expect(screen.queryByRole('option')).not.toBeInTheDocument());
    // Só o escolhido vira seleção (nome, endereço e a coordenada do candidato clicado).
    expect(await screen.findByText('Brindes Curitiba')).toBeInTheDocument();
    expect(screen.getByText('Curitiba - PR')).toBeInTheDocument();
    expect(FakeMarker.instances[0].lngLat).toEqual([-49.27, -25.43]);
    await waitFor(() => expect(screen.getByRole('button', { name: /Enviar Localização/ })).toBeEnabled());
  });

  it('candidato único continua sendo aplicado direto, sem lista', async () => {
    routeFetch({ suggest: jsonResponse(rateLimit429, 429), forward: jsonResponse(UM_CANDIDATO) });
    const input = await abrirNoMapa();

    await buscarManual(input, 'brindes curitiba');

    expect(await screen.findByText('Brindes Curitiba')).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(FakeMarker.instances[0].lngLat).toEqual([-49.27, -25.43]);
    expect(screen.getByRole('button', { name: /Enviar Localização/ })).toBeEnabled();
  });

  it('nenhum candidato: não inventa lista e avisa que não encontrou', async () => {
    routeFetch({
      suggest: jsonResponse(rateLimit429, 429),
      forward: jsonResponse({ features: [] }),
      v5: jsonResponse({ features: [] }),
    });
    const input = await abrirNoMapa();

    await buscarManual(input, 'lugar que nao existe');

    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Local não encontrado' })));
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(FakeMarker.instances).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Enviar Localização/ })).toBeDisabled();
  });

  it('com a lista manual na tela, o teclado não aplica a sugestão escondida do autocomplete', async () => {
    // O autocomplete responde normalmente e a lista dele aparece; mesmo assim o Enter sem
    // destaque dispara a busca manual. Enquanto os candidatos dela estão visíveis, as setas do
    // autocomplete não podem destacar (nem o Enter aplicar) um item que o operador não vê.
    routeFetch({
      suggest: jsonResponse(suggestXbz),
      retrieve: jsonResponse(retrieveXbz),
      forward: jsonResponse(TRES_CANDIDATOS),
    });
    const input = await abrirNoMapa();

    fireEvent.change(input, { target: { value: 'xbz' } });
    await screen.findByRole('option', { name: /XBZ\s*Brindes/ });

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).not.toHaveAttribute('aria-activedescendant');
    fireEvent.keyDown(input, { key: 'Enter' });

    // Nada foi aplicado: a lista manual continua de pé e o mapa segue sem ponto.
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(FakeMarker.instances).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Enviar Localização/ })).toBeDisabled();
  });
});
