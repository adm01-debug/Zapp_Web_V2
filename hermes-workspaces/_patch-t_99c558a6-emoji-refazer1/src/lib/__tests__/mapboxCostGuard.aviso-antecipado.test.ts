// @vitest-environment jsdom
// (a marca do aviso mensal vive em localStorage — o ambiente de src/lib e node por padrao)
/**
 * E49 — aviso antecipado a 80% do teto mensal de sessoes do Searchbox.
 *
 * Regra: a partir de 80% do teto efetivo (`getMonthlySessionLimit()`), gravar UM evento
 * `searchbox_budget_warning` por mes — mesma marca persistida por mes do E47 (a marca vive em
 * localStorage, nao em `budgetOk`, que nasce `true` a cada reload). Sem UI: o evento alimenta o
 * painel do E52.
 *
 * O teto nao e fixo (E48): 80% = 0.8 * getMonthlySessionLimit(), nao o literal 400/500. O aviso
 * NAO substitui nem impede a degradacao do E47 — quando o teto estoura, o `searchbox_cost_guard`
 * continua saindo normalmente.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({ rpc: vi.fn(), logAudit: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: h.rpc } }));
vi.mock('@/lib/audit', () => ({ logAudit: h.logAudit }));

import {
  resetSearchBudgetGuardForTests,
  forceSearchBudgetRefreshForTests,
} from '@/lib/mapboxCostGuard';

describe('E49 — aviso antecipado a 80% do teto', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSearchBudgetGuardForTests();
    h.rpc.mockReset();
    h.logAudit.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('E49: abaixo de 80% do teto NÃO emite o aviso', async () => {
    vi.stubEnv('VITE_SEARCHBOX_MONTHLY_SESSION_LIMIT', '10');
    h.rpc.mockResolvedValue({ data: 7, error: null });

    await forceSearchBudgetRefreshForTests();

    expect(h.logAudit).not.toHaveBeenCalled();
  });

  it('E49: exatamente em 80% do teto emite UMA vez com event warning, limit, count e mês', async () => {
    vi.stubEnv('VITE_SEARCHBOX_MONTHLY_SESSION_LIMIT', '10');
    h.rpc.mockResolvedValue({ data: 8, error: null });

    await forceSearchBudgetRefreshForTests();

    expect(h.logAudit).toHaveBeenCalledTimes(1);
    expect(h.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'searchbox_budget_warning',
        details: expect.objectContaining({
          event: 'warning',
          limit: 10,
          count: 8,
          month: expect.any(String),
        }),
      }),
    );
  });

  it('E49: acima de 80% mas abaixo do teto NÃO reemite na checagem seguinte do mesmo mês', async () => {
    vi.stubEnv('VITE_SEARCHBOX_MONTHLY_SESSION_LIMIT', '10');
    h.rpc.mockResolvedValue({ data: 9, error: null });
    await forceSearchBudgetRefreshForTests();

    // Mesma marca do mês: a checagem seguinte (cache de 5 min) não pode reemitir.
    await forceSearchBudgetRefreshForTests();

    expect(h.logAudit).toHaveBeenCalledTimes(1);
  });

  it('E49: teto estourado continua emitindo a degradação do E47', async () => {
    vi.stubEnv('VITE_SEARCHBOX_MONTHLY_SESSION_LIMIT', '10');
    h.rpc.mockResolvedValue({ data: 10, error: null });

    await forceSearchBudgetRefreshForTests();

    // A degradação do E47 continua saindo...
    expect(h.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'searchbox_cost_guard',
        details: expect.objectContaining({ event: 'degraded', limit: 10, count: 10 }),
      }),
    );
    // ...e o aviso de 80% não substitui nem acompanha a degradação.
    expect(h.logAudit).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'searchbox_budget_warning' }),
    );
  });

  it('E49: o limiar acompanha a configuração — teto 20 avisa em 16, não em 8', async () => {
    // Teto 20, count 8: 8 < 80% (16) → silêncio.
    vi.stubEnv('VITE_SEARCHBOX_MONTHLY_SESSION_LIMIT', '20');
    h.rpc.mockResolvedValue({ data: 8, error: null });
    await forceSearchBudgetRefreshForTests();
    expect(h.logAudit).not.toHaveBeenCalled();

    // Teto 20, count 16: 16 >= 80% (16) → aviso com o teto efetivo (20), não o literal 10/8.
    h.rpc.mockResolvedValue({ data: 16, error: null });
    await forceSearchBudgetRefreshForTests();
    expect(h.logAudit).toHaveBeenCalledTimes(1);
    expect(h.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'searchbox_budget_warning',
        details: expect.objectContaining({ event: 'warning', limit: 20, count: 16 }),
      }),
    );
  });
});
