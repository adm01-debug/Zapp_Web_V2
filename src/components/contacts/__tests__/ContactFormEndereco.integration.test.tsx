import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactForm, type ContactFormValues } from '../ContactForm';
import type { GeoSuggestion } from '@/lib/mapboxGeocode';
import { resetSearchSessionForTests } from '@/lib/mapboxSession';
// E68: respostas reais da Mapbox em disco (Apêndice A) — o fetch destes testes serve estes arquivos.
import suggestAvenida from '@/lib/__fixtures__/mapbox/suggest-avenida-paulista-1000.json';
import suggestXbz from '@/lib/__fixtures__/mapbox/suggest-xbz.json';
import retrieveXbz from '@/lib/__fixtures__/mapbox/retrieve-xbz-brindes.json';
import forwardAvenida from '@/lib/__fixtures__/mapbox/forward-avenida-paulista-1000.json';

/**
 * E67 — integração do combobox de endereço **do cadastro de contato**, com o hook real e
 * **só o `fetch` mockado** com os shapes reais do Apêndice A
 * (`docs/mapa/PLANO_BUSCA_SEARCHBOX_50_ETAPAS.md`). Este arquivo consolida o antigo
 * `AddressSearchIntegration.test.tsx` (nome divergente do pedido literal) e substitui o mock das
 * *funções* de `mapboxGeocode` por um mock da **rede**: com o mock nas funções, o parsing do shape,
 * o fallback `/suggest`→`/forward` e o `session_token` nunca eram exercitados.
 *
 * O que corre de verdade: `useAddressAutocomplete`, o reducer, `mapboxGeocode` (`/suggest`,
 * `/retrieve`, `/forward` + parsing do Apêndice A), `mapboxSession` e o `ContactForm`. Ficam de
 * fora só as bordas que não são a resposta da Mapbox: o token (Supabase) e a guarda de custo
 * (Supabase) — sem eles o teste não roda em jsdom.
 */

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  getMapboxToken: vi.fn().mockResolvedValue('tok'),
}));

vi.stubGlobal('fetch', (...args: unknown[]) => h.fetch(...args));

vi.mock('@/lib/mapboxToken', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mapboxToken')>();
  return { ...actual, getMapboxToken: (...args: unknown[]) => h.getMapboxToken(...args), reportMapboxFailure: vi.fn() };
});
vi.mock('@/lib/mapboxCostGuard', () => ({ isSearchBudgetOk: () => true }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

// O formulário de contato chama hooks que exigem sessão (ex.: região do contato) — o que este teste
// cobre é a busca de endereço, não o login.
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u-teste' }, session: null, profile: { id: 'u-teste', role: 'admin' }, loading: false }),
}));

const values = (): ContactFormValues => ({ name: 'XBZ Brindes', phone: '11999999999' }) as ContactFormValues;

// E68: os shapes do Apêndice A saíram daqui — vivem em `src/lib/__fixtures__/mapbox/*.json`.
// `suggest-avenida-paulista-1000.json` é o resultado real do termo (E47), com `feature_type:
// 'address'` porque o cadastro usa `ADDRESS_SEARCH_TYPES` (sem POI).

type Resp = { ok: boolean; status: number; json: () => Promise<unknown> };
function jsonResponse(body: unknown, status = 200): Resp {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

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

function renderForm(onChange = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ContactForm values={values()} onChange={onChange} onSubmit={vi.fn()} onCancel={vi.fn()} submitLabel="Salvar" />
    </QueryClientProvider>,
  );
  const input = screen.getByLabelText('Logradouro');
  fireEvent.focus(input);
  return { input, onChange };
}

/** Digita e espera a busca de endereço sair (debounce real de 300 ms; teto para não travar). */
async function digitar(input: HTMLElement, texto: string) {
  fireEvent.change(input, { target: { value: texto } });
  await waitFor(() => expect(callsTo('/search/searchbox/v1/suggest')).not.toHaveLength(0), { timeout: 2000 });
}

beforeEach(() => {
  h.fetch.mockReset();
  h.getMapboxToken.mockReset().mockResolvedValue('tok');
  // O cache de /suggest é chaveado pelo session_token e vive em closure de módulo: sem resetar a
  // sessão, o 2º teste que digitar o mesmo termo receberia cache e não exercitaria o fetch.
  resetSearchSessionForTests();
  // Termo digitado nunca vai para telemetria (E39) — o teste guarda a promessa.
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('E67 · integração do combobox de endereço do cadastro (hook real, só fetch mockado)', () => {
  it('1) digitar dispara UMA busca no /suggest e mostra a sugestão do shape real', async () => {
    routeFetch({ suggest: jsonResponse(suggestAvenida) });
    const { input } = renderForm();

    await digitar(input, 'avenida paulista');

    expect(callsTo('/search/searchbox/v1/suggest')).toHaveLength(1);
    expect(await screen.findByRole('option', { name: /Avenida Paulista/ })).toBeInTheDocument();
    // Só o /suggest respondeu — nada de /forward nem /retrieve para uma listagem.
    expect(callsTo('/search/searchbox/v1/forward')).toHaveLength(0);
    expect(callsTo('/search/searchbox/v1/retrieve/')).toHaveLength(0);
  });

  it('2) /suggest fora do ar: o /forward assume e a lista aparece (sem erro na tela)', async () => {
    routeFetch({ suggest: new TypeError('Failed to fetch'), forward: jsonResponse(forwardAvenida) });
    const { input } = renderForm();

    await digitar(input, 'avenida paulista 1000');

    await waitFor(() => expect(callsTo('/search/searchbox/v1/forward')).toHaveLength(1));
    expect(callsTo('/search/searchbox/v1/suggest')).toHaveLength(1);
    expect(await screen.findByRole('option', { name: /Avenida Paulista, 1000/ })).toBeInTheDocument();
    expect(screen.queryByText('Falha ao buscar sugestões')).not.toBeInTheDocument();
  });

  it('3) as duas rotas fora: erro com a causa real e o botão de tentar de novo', async () => {
    routeFetch({
      suggest: new TypeError('Failed to fetch'),
      forward: new TypeError('Failed to fetch'),
      v5: new TypeError('Failed to fetch'),
    });
    const { input } = renderForm();

    await digitar(input, 'avenida paulista 1000');

    expect(await screen.findByText(/Falha ao buscar sugestões/)).toBeInTheDocument();
    expect(screen.getByText('Sem conexão com o serviço de mapas.')).toBeInTheDocument();
    expect(screen.queryByText(/Nada encontrado/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('4) "Tentar novamente" refaz a busca na hora (sem esperar o debounce)', async () => {
    routeFetch({ suggest: new TypeError('Failed to fetch'), forward: new TypeError('Failed to fetch'), v5: new TypeError('Failed to fetch') });
    const { input } = renderForm();
    await digitar(input, 'avenida paulista 1000');
    expect(callsTo('/search/searchbox/v1/suggest')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(callsTo('/search/searchbox/v1/suggest')).toHaveLength(2));
  });

  it('5) escolher a sugestão preenche o endereço e a coordenada a partir do /retrieve (fixture do Apêndice A)', async () => {
    routeFetch({ suggest: jsonResponse(suggestXbz), retrieve: jsonResponse(retrieveXbz) });
    const onChange = vi.fn();
    const { input } = renderForm(onChange);

    await digitar(input, 'xbz');
    fireEvent.click(await screen.findByRole('option', { name: /XBZ\s*Brindes/ }));

    // Os valores vêm do retrieve-xbz-brindes.json (Apêndice A), não de strings soltas no teste.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('address', 'R. da Independência'));
    expect(onChange).toHaveBeenCalledWith('address_number', '100');
    expect(onChange).toHaveBeenCalledWith('neighborhood', 'Liberdade');
    expect(onChange).toHaveBeenCalledWith('city', 'São Paulo');
    expect(onChange).toHaveBeenCalledWith('state', 'SP');
    expect(onChange).toHaveBeenCalledWith('postal_code', '01524000');
    expect(onChange).toHaveBeenCalledWith('latitude', '-23.56672978');
    expect(onChange).toHaveBeenCalledWith('longitude', '-46.61563441');
    expect(callsTo('/search/searchbox/v1/retrieve/')).toHaveLength(1);
  });

  it('6) a request do /suggest carrega o filtro de tipos do cadastro (sem POI) e o locale do Apêndice A', async () => {
    routeFetch({ suggest: jsonResponse(suggestAvenida) });
    const { input } = renderForm();

    await digitar(input, 'avenida paulista');

    const url = new URL(String(callsTo('/search/searchbox/v1/suggest')[0][0]));
    // `types` é o que exclui POI no cadastro (só logradouro/endereço) — sem ele "XBZ Brindes" viraria
    // resultado de rua no formulário de contato.
    expect(url.searchParams.get('types')).toBe('address,street,place');
    expect(url.searchParams.get('country')).toBe('br');
    expect(url.searchParams.get('language')).toBe('pt');
    expect(url.searchParams.get('session_token')).toBeTruthy();
  });

  it('7) sugestão vinda do /forward (com coordenada) preenche o formulário sem gastar /retrieve (E15)', async () => {
    routeFetch({ suggest: new TypeError('Failed to fetch'), forward: jsonResponse(forwardAvenida) });
    const onChange = vi.fn();
    const { input } = renderForm(onChange);

    await digitar(input, 'avenida paulista 1000');
    fireEvent.click(await screen.findByRole('option', { name: /Avenida Paulista, 1000/ }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('latitude', '-23.5613'));
    expect(onChange).toHaveBeenCalledWith('longitude', '-46.6565');
    expect(callsTo('/search/searchbox/v1/retrieve/')).toHaveLength(0);
  });
});
