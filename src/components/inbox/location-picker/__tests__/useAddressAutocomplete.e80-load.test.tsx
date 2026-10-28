import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { GeoSuggestion } from '@/lib/mapboxGeocode';

// E80 · Teste de carga leve do debounce (sanidade de custo).
// Mede, com fake timers, quantos requests e quantas sessões 200 teclas em 5 s geram.
//
// NOTA DE PROJETO DESTE ARQUIVO: aqui o módulo `@/lib/mapboxSession` NÃO é mockado (diferente de
// `useAddressAutocomplete.test.tsx`). O mock padrão devolve sempre 'session-1', o que faria a
// contagem de sessões ser decorativa: qualquer número de requests "usaria 1 sessão". Usando o
// módulo REAL, `getSearchSession()` de fato cria sessão (logAudit 'searchbox_session') e o token
// devolvido a `suggestPlaces` é o real — é isso que prova "1 sessão". O resto dos mocks segue o
// padrão do arquivo irmão.
const h = vi.hoisted(() => ({
  suggestPlaces: vi.fn(),
  retrievePlaceResult: vi.fn(),
  searchPlaces: vi.fn(),
  getCachedSuggest: vi.fn(),
  reportMapboxFailure: vi.fn(),
  isSearchBudgetOk: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/mapboxGeocode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mapboxGeocode')>();
  return {
    ...actual,
    suggestPlaces: (...args: unknown[]) => h.suggestPlaces(...args),
    retrievePlaceResult: (...args: unknown[]) => h.retrievePlaceResult(...args),
    searchPlaces: (...args: unknown[]) => h.searchPlaces(...args),
    getCachedSuggest: (...args: unknown[]) => h.getCachedSuggest(...args),
  };
});
vi.mock('@/lib/mapboxToken', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mapboxToken')>();
  return { ...actual, reportMapboxFailure: (...args: unknown[]) => h.reportMapboxFailure(...args) };
});
vi.mock('@/lib/mapboxCostGuard', () => ({
  isSearchBudgetOk: () => h.isSearchBudgetOk(),
}));
vi.mock('@/lib/audit', () => ({ logAudit: (...args: unknown[]) => h.logAudit(...args) }));

import { useAddressAutocomplete } from '../useAddressAutocomplete';
import { resetSearchSessionForTests } from '@/lib/mapboxSession';

const suggestionA: GeoSuggestion = { id: 'a', name: 'Rua A', address: 'Rua A, São Paulo', kind: 'street' };

describe('E80 — carga leve do debounce (200 teclas em 5 s)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSearchSessionForTests();
    h.suggestPlaces.mockReset();
    h.suggestPlaces.mockResolvedValue({ ok: true, suggestions: [suggestionA] });
    h.retrievePlaceResult.mockReset();
    h.searchPlaces.mockReset().mockResolvedValue({ ok: false, kind: 'not_found' });
    h.getCachedSuggest.mockReset().mockReturnValue(undefined);
    h.reportMapboxFailure.mockReset();
    h.isSearchBudgetOk.mockReset().mockReturnValue(true);
    h.logAudit.mockReset();
  });

  afterEach(() => {
    resetSearchSessionForTests();
    vi.useRealTimers();
  });

  it('200 teclas em 5 s: <= 17 requests (1 a cada 300 ms) e exatamente 1 sessão', async () => {
    const { result } = renderHook(() =>
      useAddressAutocomplete({ token: 'tok', enabled: true }),
    );

    // 200 teclas distribuídas em 5 s de tempo FAKE: uma tecla a cada 25 ms (25 ms * 200 = 5000 ms).
    // O termo cresce a cada tecla (o piso de 3 caracteres deixa as 2 primeiras sem busca).
    let term = '';
    for (let i = 0; i < 200; i++) {
      term += 'a';
      act(() => { result.current.setQuery(term); });
      act(() => { vi.advanceTimersByTime(25); });
    }
    // Deixa o último timer de debounce (300 ms) disparar depois da última tecla.
    await act(async () => { vi.advanceTimersByTime(300); });

    const requests = h.suggestPlaces.mock.calls.length;
    // Sessões REAIS criadas pelo módulo real (a Mapbox cobra por sessão, não por request).
    const sessionsCreated = h.logAudit.mock.calls.filter(
      (call) => (call[0] as { action?: string } | undefined)?.action === 'searchbox_session',
    ).length;
    // Tokens distintos entregues aos requests — todos têm de ser o MESMO token (1 sessão).
    const tokens = new Set(
      h.suggestPlaces.mock.calls.map(
        (call) => (call[2] as { session?: string } | undefined)?.session,
      ),
    );

    expect(requests).toBeGreaterThanOrEqual(1); // a digitação realmente foi buscar
    expect(requests).toBeLessThanOrEqual(17); // 5000 / 300 = 16,66 -> teto 17
    expect(sessionsCreated).toBe(1);
    expect(tokens.size).toBe(1);
  });
});
