/**
 * W1 — sonda independente dos achados A3-01 (clique duplo) e A3-04 (pausa de 429 que expira).
 *
 * Diferenca em relacao ao teste do repo: `useAddressAutocomplete` e o REAL (nao mockado).
 * So o transporte de rede (mapboxGeocode) e a telemetria (audit) sao observados por baixo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { appendFileSync } from 'node:fs';

const EVIDENCE = '/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/auditoria-onda2-2609291646adae/W1-probes/W1-achado2-3.evidence.jsonl';
function record(tag: string, data: unknown) {
  appendFileSync(EVIDENCE, JSON.stringify({ tag, data }) + '\n');
}

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  suggest: vi.fn(),
  retrieve: vi.fn(),
  forward: vi.fn(),
  logAudit: vi.fn(),
  flag: vi.fn(),
  picker: vi.fn(),
  budgetOk: vi.fn(),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: (...a: unknown[]) => h.toast(...a) }));
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: (...a: unknown[]) => h.flag(...a) }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => h.logAudit(...a) }));
vi.mock('@/lib/mapboxCostGuard', () => ({
  isSearchBudgetOk: (...a: unknown[]) => h.budgetOk(...a),
  MONTHLY_SESSION_LIMIT: 450,
}));
vi.mock('@/lib/mapboxToken', () => ({
  getMapboxToken: vi.fn(async () => 'tok'),
  reportMapboxFailure: vi.fn(),
  MAPBOX_TOKEN_TIMEOUT_MS: 8000,
  MAPBOX_MAP_LOAD_TIMEOUT_MS: 20000,
}));
vi.mock('@/components/inbox/location-picker/useLocationPicker', () => ({
  useLocationPicker: (...a: unknown[]) => h.picker(...a),
}));
vi.mock('@/lib/mapboxGeocode', () => ({
  suggestPlaces: (...a: unknown[]) => h.suggest(...a),
  retrievePlaceResult: (...a: unknown[]) => h.retrieve(...a),
  searchPlaces: (...a: unknown[]) => h.forward(...a),
  clearSuggestCacheForSession: vi.fn(),
  SEARCH_RESULT_LIMIT: 5,
}));

import { LocationPicker } from '@/components/inbox/LocationPicker';

const PLACE_A = { name: 'XBZ Brindes', address: 'R. Independencia, SP', lat: -23.5, lng: -46.6 };

function pickerState() {
  return {
    mapContainer: vi.fn(),
    isMapLoaded: true,
    mapError: null,
    retryMap: vi.fn(),
    isLoadingLocation: false,
    mapboxToken: 'tok',
    searchQuery: '',
    setSearchQuery: vi.fn(),
    isSearching: false,
    selectedLocation: null,
    searchResults: [],
    chooseSearchResult: vi.fn(),
    getCurrentLocation: vi.fn(),
    searchLocation: vi.fn(),
    reset: vi.fn(),
    proximity: undefined,
  };
}

const SUGGESTION = [{ id: 'sg-1', name: 'XBZ Brindes', address: 'R. Independencia, SP', kind: 'poi' as const }];

async function openMapTabWithSuggestions() {
  render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);
  const mapTab = screen.getByRole('tab', { name: /Escolher no Mapa/ });
  fireEvent.click(mapTab);
  fireEvent.focus(mapTab);
  const input = await screen.findByRole('combobox');
  fireEvent.focusIn(input);
  fireEvent.change(input, { target: { value: 'xbz' } });
  const option = await screen.findByRole('option', { name: /XBZ/ }, { timeout: 4000 });
  return { input, option };
}

function sessionsBilled() {
  return h.logAudit.mock.calls.filter((c) => (c[0] as { action?: string })?.action === 'searchbox_session').length;
}
function falseDestructiveToasts() {
  return h.toast.mock.calls.filter(
    (c) => (c[0] as { title?: string })?.title === 'Não consegui obter a coordenada',
  ).length;
}
function pausedText() {
  return (document.body.textContent || '').match(/Sugestões pausadas[^.]*\./)?.[0] ?? null;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  h.flag.mockReturnValue(true);
  h.budgetOk.mockReturnValue(true);
  h.picker.mockImplementation(() => pickerState());
  h.suggest.mockResolvedValue({ ok: true, suggestions: SUGGESTION });
  h.forward.mockResolvedValue({ ok: false, kind: 'network' });
});

describe('W1 · A3-01 clique duplo / Enter segurado', () => {
  it('2 cliques na MESMA sugestao', async () => {
    const resolvers: Array<(v: unknown) => void> = [];
    h.retrieve.mockImplementation(() => new Promise((res) => { resolvers.push(res); }));

    const { option } = await openMapTabWithSuggestions();

    fireEvent.click(option);
    await waitFor(() => expect(h.retrieve).toHaveBeenCalledTimes(1));

    const duranteRetrieve = {
      optionEstaDesabilitada: (option as HTMLButtonElement).disabled,
      retrieve: h.retrieve.mock.calls.length,
      toastsFalsos: falseDestructiveToasts(),
    };

    fireEvent.click(option);
    await waitFor(() => expect(h.retrieve).toHaveBeenCalledTimes(2));

    await act(async () => { resolvers[0]?.({ ok: true, place: PLACE_A }); });
    await act(async () => { resolvers[1]?.({ ok: true, place: PLACE_A }); });
    await act(async () => { await Promise.resolve(); });

    const evidencia = {
      duranteRetrieve,
      totalRetrieve: h.retrieve.mock.calls.length,
      totalSessoesFaturadas: sessionsBilled(),
      toastsDestrutivosFalsos: falseDestructiveToasts(),
      toastsTotais: h.toast.mock.calls.length,
      titulos: h.toast.mock.calls.map((c) => (c[0] as { title?: string })?.title),
    };
    record('A3-01-duplo', evidencia);
    expect(evidencia.toastsDestrutivosFalsos).toBe(evidencia.totalRetrieve - 1);
    cleanup();
  });

  it('3 cliques na MESMA sugestao (checa a formula N-1)', async () => {
    const resolvers: Array<(v: unknown) => void> = [];
    h.retrieve.mockImplementation(() => new Promise((res) => { resolvers.push(res); }));

    const { option } = await openMapTabWithSuggestions();
    fireEvent.click(option);
    await waitFor(() => expect(h.retrieve).toHaveBeenCalledTimes(1));
    fireEvent.click(option);
    fireEvent.click(option);
    await waitFor(() => expect(h.retrieve).toHaveBeenCalledTimes(3));

    for (const r of resolvers) {
      await act(async () => { r?.({ ok: true, place: PLACE_A }); });
    }
    await act(async () => { await Promise.resolve(); });

    const evidencia = {
      totalRetrieve: h.retrieve.mock.calls.length,
      totalSessoesFaturadas: sessionsBilled(),
      toastsDestrutivosFalsos: falseDestructiveToasts(),
    };
    record('A3-01-triplo', evidencia);
    cleanup();
  });
});

describe('W1 · A3-04 pausa de 429 que expira', () => {
  it('apos o backoff: texto, botao e religa automatico', async () => {
    const realNow = Date.now;
    let offset = 0;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => realNow.call(Date) + offset);
    try {
      h.suggest.mockResolvedValue({ ok: false, kind: 'rate_limited' });

      render(<LocationPicker open onOpenChange={vi.fn()} onSend={vi.fn()} />);
      const mapTab = screen.getByRole('tab', { name: /Escolher no Mapa/ });
      fireEvent.click(mapTab);
      fireEvent.focus(mapTab);
      const input = await screen.findByRole('combobox');
      fireEvent.focusIn(input);
      fireEvent.change(input, { target: { value: 'xbz' } });

      await screen.findByText('Falha ao buscar sugestões.', {}, { timeout: 4000 });
      const estadoApos429 = {
        suggestCalls: h.suggest.mock.calls.length,
        temBotaoTentarNovamente: !!screen.queryByRole('button', { name: 'Tentar novamente' }),
        causa: screen.queryByText(/Limite de buscas atingido/) ? 'Limite de buscas atingido — aguarde 1 min.' : null,
      };

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
      });
      await screen.findByText(/Sugestões pausadas/, {}, { timeout: 4000 });
      const estadoAposRetryNoBackoff = {
        temBotaoTentarNovamente: !!screen.queryByRole('button', { name: 'Tentar novamente' }),
        textoNaTela: pausedText(),
        suggestCalls: h.suggest.mock.calls.length,
      };

      // Depois do retry no backoff, o relogio fica em 0 por 3 s: nada deveria religar.
      const tentativasBase = { value: h.budgetOk.mock.calls.length };
      const antes = await observar(3200);
      // O backoff expira: 61 s no relogio, sem nenhum gesto do operador.
      offset = 61_000;
      const depois = await observar(3200);
      const aposBackoffExpirar = {
        antesDoBackoffExpirar: antes,
        depoisDoBackoffExpirar: depois,
        temBotaoTentarNovamente: !!screen.queryByRole('button', { name: 'Tentar novamente' }),
        suggestCalls: h.suggest.mock.calls.length,
      };
      async function observar(janelaMs: number) {
        const amostras: Array<{ t: number; suggest: number; texto: string | null }> = [];
        const fim = realNow.call(Date) + janelaMs;
        while (realNow.call(Date) < fim) {
          await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
          amostras.push({ t: amostras.length * 250, suggest: h.suggest.mock.calls.length, tentativasAlemDoBackoff: h.budgetOk.mock.calls.length - tentativasBase.value, texto: pausedText() });
        }
        // comprime: so as transicoes
        return amostras.filter((a, i) => i === 0 || a.suggest !== amostras[i - 1].suggest || a.texto !== amostras[i - 1].texto);
      }

      // Unico gesto que resta: digitar de novo (o teclado ja voltou a bater no /suggest?).
      await act(async () => { fireEvent.change(input, { target: { value: 'xbz paulista' } }); });
      await waitFor(() => expect(h.suggest.mock.calls.length).toBeGreaterThan(1), { timeout: 4000 });
      const aposDigitarDeNovo = {
        suggestCalls: h.suggest.mock.calls.length,
        textoNaTela: pausedText(),
        statusRenderizado: screen.queryByText(/Sugestões pausadas/) ? 'paused' : 'nao-paused',
      };

      record('A3-04', { estadoApos429, estadoAposRetryNoBackoff, aposBackoffExpirar, aposDigitarDeNovo });
    } finally {
      spy.mockRestore();
      cleanup();
    }
  });
});
