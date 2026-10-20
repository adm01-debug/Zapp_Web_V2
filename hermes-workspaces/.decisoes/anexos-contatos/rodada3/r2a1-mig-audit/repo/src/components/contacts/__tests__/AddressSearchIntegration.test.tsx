import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactForm, type ContactFormValues } from '../ContactForm';
import type { GeoSuggestion, GeoSearchPlace, GeoFailureKind } from '@/lib/mapboxGeocode';

/**
 * E33 — teste de integração do combobox de endereço **com o hook real**.
 *
 * O que NÃO é mockado (é o que este teste existe para cobrir): `useAddressAutocomplete`, o reducer,
 * a `SuggestionList` e o `ContactForm`. Só as bordas de rede saem do caminho: `/suggest`, `/forward`
 * e `/retrieve` (a Mapbox) e o token. Sem isso o teste provaria só os mocks — foi assim que o C1 e o
 * C2 passaram pela squite antiga.
 */

const h = vi.hoisted(() => ({
  // 1 por rota, como o hook chama de verdade (E22: contagem de request por cenário).
  suggestPlaces: vi.fn(),
  searchPlaces: vi.fn(),
  retrievePlaceResult: vi.fn(),
}));

vi.mock('@/lib/mapboxToken', () => ({
  getMapboxToken: async () => 'tok',
  reportMapboxFailure: vi.fn(),
  mapboxFailureKindOf: () => 'network',
  mapboxFailureKindFromMapError: () => 'network',
  mapboxFailureMessage: () => 'Sem conexão com o serviço de mapas.',
  MAPBOX_TOKEN_TIMEOUT_MS: 8_000,
  MAPBOX_MAP_LOAD_TIMEOUT_MS: 20_000,
}));

vi.mock('@/lib/mapboxGeocode', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/mapboxGeocode')>();
  return {
    ...real,
    suggestPlaces: (...args: unknown[]) => h.suggestPlaces(...args),
    searchPlaces: (...args: unknown[]) => h.searchPlaces(...args),
    retrievePlaceResult: (...args: unknown[]) => h.retrievePlaceResult(...args),
  };
});

vi.mock('@/lib/mapboxCostGuard', () => ({
  isSearchBudgetOk: () => true,
  noteSuggestCall: vi.fn().mockResolvedValue(undefined),
  noteRetrieveCall: vi.fn().mockResolvedValue(undefined),
  getSearchSession: () => ({ sessionToken: 'sess-1', source: 'searchbox' }),
  endSearchSession: vi.fn(),
  clearSuggestCacheForSession: vi.fn(),
}));

// O formulário de contato chama hooks que exigem sessão (ex.: região do contato) — o que este teste
// cobre é a busca de endereço, não o login.
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u-teste' },
    session: null,
    profile: { id: 'u-teste', role: 'admin' },
    loading: false,
  }),
}));

const values = (): ContactFormValues => ({ name: 'XBZ Brindes', phone: '11999999999' }) as ContactFormValues;

const forwardPlace: GeoSearchPlace = {
  name: 'Avenida Paulista, 1000',
  address: 'Av. Paulista, 1000 - Bela Vista, São Paulo',
  lat: -23.5613,
  lng: -46.6565,
};

function renderForm(onChange = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ContactForm
        values={values()}
        onChange={onChange}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        submitLabel="Salvar"
      />
    </QueryClientProvider>,
  );
  const input = screen.getByLabelText('Logradouro');
  fireEvent.focus(input);
  return { input, onChange };
}

/** Digita e espera o debounce do hook (300 ms, com teto para o teste não travar). */
async function digitar(input: HTMLElement, texto: string) {
  fireEvent.change(input, { target: { value: texto } });
  await waitFor(() => expect(h.suggestPlaces).toHaveBeenCalled(), { timeout: 2000 });
}

beforeEach(() => {
  h.suggestPlaces.mockReset();
  h.searchPlaces.mockReset().mockResolvedValue({ ok: false, kind: 'not_found' as GeoFailureKind });
  h.retrievePlaceResult.mockReset();
  // Termo digitado nunca vai para telemetria (E39) — o teste guarda a promessa.
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('E33 · integração do combobox de endereço (hook real)', () => {
  it('1) digitar 3 letras dispara UMA busca e mostra a sugestão', async () => {
    h.suggestPlaces.mockResolvedValue({
      ok: true,
      suggestions: [{ id: 'a', name: 'Avenida Paulista, 1000', address: 'Av. Paulista, 1000', kind: 'address' } as GeoSuggestion],
    });
    const { input } = renderForm();

    await digitar(input, 'avenida paulista');

    expect(h.suggestPlaces).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('option', { name: /Avenida Paulista/ })).toBeInTheDocument();
    expect(h.searchPlaces).not.toHaveBeenCalled();
  });

  it('2) /suggest fora do ar: o /forward assume e a lista aparece (sem erro na tela)', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: false, kind: 'network' as GeoFailureKind });
    h.searchPlaces.mockResolvedValue({ ok: true, places: [forwardPlace] });
    const { input } = renderForm();

    await digitar(input, 'avenida paulista 1000');

    await waitFor(() => expect(h.searchPlaces).toHaveBeenCalledTimes(1));
    expect(h.suggestPlaces).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('option', { name: /Avenida Paulista, 1000/ })).toBeInTheDocument();
    expect(screen.queryByText('Falha ao buscar sugestões')).not.toBeInTheDocument();
  });

  it('3) as duas rotas fora: erro com a causa real e o botão de tentar de novo', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: false, kind: 'network' as GeoFailureKind });
    h.searchPlaces.mockResolvedValue({ ok: false, kind: 'network' as GeoFailureKind });
    const { input } = renderForm();

    await digitar(input, 'avenida paulista 1000');

    expect(await screen.findByText(/Falha ao buscar sugestões/)).toBeInTheDocument();
    expect(screen.getByText('Sem conexão com o serviço de mapas.')).toBeInTheDocument();
    expect(screen.queryByText(/Nada encontrado/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('4) "Tentar novamente" refaz a busca na hora (sem esperar o debounce)', async () => {
    h.suggestPlaces.mockResolvedValue({ ok: false, kind: 'network' as GeoFailureKind });
    h.searchPlaces.mockResolvedValue({ ok: false, kind: 'network' as GeoFailureKind });
    const { input } = renderForm();
    await digitar(input, 'avenida paulista 1000');
    expect(h.suggestPlaces).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(h.suggestPlaces).toHaveBeenCalledTimes(2));
  });

  it('5) escolher a sugestão preenche o endereço e a coordenada no formulário', async () => {
    h.suggestPlaces.mockResolvedValue({
      ok: true,
      suggestions: [{ id: 'a', name: 'Avenida Paulista, 1000', address: 'Av. Paulista, 1000', kind: 'address' } as GeoSuggestion],
    });
    h.retrievePlaceResult.mockResolvedValue({
      ok: true,
      place: {
        name: 'Avenida Paulista, 1000',
        address: 'Av. Paulista, 1000',
        lat: -23.5613,
        lng: -46.6565,
        components: {
          street: 'Av. Paulista',
          addressNumber: '1000',
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          stateCode: 'SP',
          postalCode: '01310-100',
        },
      },
    });
    const onChange = vi.fn();
    const { input } = renderForm(onChange);

    await digitar(input, 'avenida paulista');
    fireEvent.click(await screen.findByRole('option', { name: /Avenida Paulista/ }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('address', 'Av. Paulista'));
    expect(onChange).toHaveBeenCalledWith('address_number', '1000');
    expect(onChange).toHaveBeenCalledWith('city', 'São Paulo');
    expect(onChange).toHaveBeenCalledWith('state', 'SP');
    expect(onChange).toHaveBeenCalledWith('postal_code', '01310100');
    expect(onChange).toHaveBeenCalledWith('latitude', '-23.5613');
    expect(onChange).toHaveBeenCalledWith('longitude', '-46.6565');
    expect(h.retrievePlaceResult).toHaveBeenCalledTimes(1);
  });
});
