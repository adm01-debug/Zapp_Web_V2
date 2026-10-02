/**
 * E98 · frente "sessão fantasma" (custo) — teste discriminante.
 *
 * `count_searchbox_sessions_this_month()` conta registros de `audit_logs` com
 * `action='searchbox_session'` (supabase/migrations/20260926120500_...sql:15-17), e esse evento é
 * gravado por `createSession()` (mapboxSession.ts:26) — ou seja, na ABERTURA do token, antes de
 * qualquer requisição sair.
 *
 * Consequência: esse número é o que (a) degrada o autocomplete em 450
 * (`mapboxCostGuard.ts` → MONTHLY_SESSION_LIMIT) e (b) dispara o alerta de custo em 400 (E91).
 * Se ele conta abertura e não uso faturado, o freio e o alerta agem ANTES do gasto real.
 *
 * Este teste afirma o comportamento DESEJADO. Ele deve ficar VERMELHO enquanto o defeito existir:
 * sessão aberta sem nenhum `/suggest` faturado não deveria contar como sessão.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const logAudit = vi.fn();
vi.mock('@/lib/audit', () => ({ logAudit: (...args: unknown[]) => logAudit(...args) }));
vi.mock('@/lib/mapboxGeocode', () => ({ clearSuggestCacheForSession: vi.fn() }));

import { getSearchSession, endSearchSession, resetSearchSessionForTests } from '@/lib/mapboxSession';

const sessoesContadas = () => logAudit.mock.calls.filter((c) => (c[0] as { action?: string })?.action === 'searchbox_session').length;

describe('E98 · sessão fantasma: abertura de sessão não pode contar como sessão faturada', () => {
  beforeEach(() => {
    resetSearchSessionForTests();
    logAudit.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  // `it.fails`: o defeito é conhecido e está aberto. Enquanto ele existir, este teste FALHA (e o
  // `it.fails` mantém o CI verde, porque a falha é o resultado esperado). Quando alguém consertar
  // a contagem, este teste passa a PASSAR e o `it.fails` vira VERMELHO — obrigando o conserto a
  // atualizar o teste em vez de deixá-lo decorativo.
  it.fails('abrir e encerrar sessão 3x sem NENHUM request faturado não conta sessão nenhuma', () => {
    for (let i = 0; i < 3; i += 1) {
      getSearchSession('picker');
      endSearchSession();
    }

    const requests = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(requests, 'nenhuma requisição saiu para a rede').toBe(0);
    expect(
      sessoesContadas(),
      'sessão aberta sem uso faturado está sendo contada — é o que infla o freio de 450 e o alerta de 400',
    ).toBe(0);
  });
});
