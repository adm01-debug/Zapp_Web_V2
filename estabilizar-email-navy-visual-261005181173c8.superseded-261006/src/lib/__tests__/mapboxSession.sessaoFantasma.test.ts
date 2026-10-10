/**
 * E98/E100 · frente "sessão fantasma" (custo) — teste de regressão do conserto.
 *
 * `count_searchbox_sessions_this_month()` conta registros de `audit_logs` com
 * `action='searchbox_session'`, e esse número é o que (a) degrada o autocomplete em 450
 * (`mapboxCostGuard.ts` → MONTHLY_SESSION_LIMIT) e (b) dispara o alerta de custo em 400 (E91).
 *
 * **O defeito (E98):** o evento era gravado na ABERTURA do token, antes de qualquer requisição
 * sair — então o contador media intenção, não uso, e freio e alerta agiam antes do gasto existir.
 *
 * **O conserto (E100):** o evento é adiado para o primeiro request faturado da sessão e gravado
 * uma única vez por token. Este arquivo era `it.fails` (pina o defeito); agora afirma o caminho
 * correto — e fica VERMELHO se alguém voltar a gravar o evento na abertura.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const logAudit = vi.fn();
vi.mock('@/lib/audit', () => ({ logAudit: (...args: unknown[]) => logAudit(...args) }));
vi.mock('@/lib/mapboxGeocode', () => ({ clearSuggestCacheForSession: vi.fn() }));

import {
  getSearchSession,
  noteSuggestCall,
  noteRetrieveCall,
  endSearchSession,
  resetSearchSessionForTests,
} from '@/lib/mapboxSession';

const sessoesContadas = () =>
  logAudit.mock.calls.filter((c) => (c[0] as { action?: string })?.action === 'searchbox_session').length;

describe('E98/E100 · sessão fantasma: só conta sessão FATURADA (com request)', () => {
  beforeEach(() => {
    resetSearchSessionForTests();
    logAudit.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('abrir e encerrar sessão 3x sem NENHUM request faturado não conta sessão nenhuma', () => {
    for (let i = 0; i < 3; i += 1) {
      getSearchSession('picker');
      endSearchSession();
    }

    const requests = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(requests, 'nenhuma requisição saiu para a rede').toBe(0);
    expect(
      sessoesContadas(),
      'sessão aberta sem uso faturado está sendo contada — é o que infla o freio de 450 e o alerta de 400'
    ).toBe(0);
  });

  it('a PRIMEIRA busca conta exatamente 1 sessão', () => {
    getSearchSession('picker');
    noteSuggestCall();

    expect(sessoesContadas(), 'um `/suggest` faturado = uma sessão').toBe(1);
  });

  it('50 `/suggest` sob o mesmo token continuam contando 1 sessão (cobrança é por sessão)', () => {
    getSearchSession('picker');
    for (let i = 0; i < 50; i += 1) noteSuggestCall();

    expect(sessoesContadas(), 'o evento não pode ser gravado por request').toBe(1);
  });

  it('o `/retrieve` de uma sessão que já contou não conta de novo', () => {
    getSearchSession('picker');
    noteSuggestCall();
    noteRetrieveCall();

    expect(sessoesContadas()).toBe(1);
  });

  it('/retrieve sem /suggest ainda conta a sessão (é uso faturado)', () => {
    getSearchSession('picker');
    noteRetrieveCall();

    expect(sessoesContadas()).toBe(1);
  });

  it('sessão nova após encerrar conta de novo: 2 usos faturados em 2 tokens = 2 sessões', () => {
    getSearchSession('picker');
    noteSuggestCall();
    endSearchSession();

    getSearchSession('picker');
    noteSuggestCall();

    expect(sessoesContadas()).toBe(2);
  });

  it('o `source` registrado é o da sessão que foi de fato usada', () => {
    getSearchSession('contact-form');
    noteSuggestCall();

    const evento = logAudit.mock.calls.find(
      (c) => (c[0] as { action?: string })?.action === 'searchbox_session'
    );
    expect((evento?.[0] as { details?: { source?: string } })?.details?.source).toBe('contact-form');
  });
});
