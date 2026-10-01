/**
 * E47 — o evento de degradação do orçamento (`searchbox_cost_guard`) tem de sair UMA vez por mês.
 *
 * O defeito: o evento dispara na transição "estava ok → estourou", mas `budgetOk` nasce `true` a
 * cada carregamento do app. Quem recarregava a página depois de estourar o teto emitia o evento de
 * novo — não era "1 por mês", era "1 por reload". Medido antes de mexer: 0 linhas em audit_logs,
 * ou seja o teto nunca foi atingido; o defeito é de código, não de dado acumulado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({ rpc: vi.fn(), logAudit: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: h.rpc } }));
vi.mock('@/lib/audit', () => ({ logAudit: h.logAudit }));

import { resetSearchBudgetGuardForTests, forceSearchBudgetRefreshForTests } from '@/lib/mapboxCostGuard';

describe('E47 — aviso de degradação uma vez por mês', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSearchBudgetGuardForTests();
    h.rpc.mockReset();
    h.logAudit.mockReset();
    vi.stubEnv('VITE_SEARCHBOX_MONTHLY_SESSION_LIMIT', '10');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('reload depois do teto estourado NÃO reemite o aviso do mês', async () => {
    h.rpc.mockResolvedValue({ data: 11, error: null });
    await forceSearchBudgetRefreshForTests();
    expect(h.logAudit).toHaveBeenCalledTimes(1);

    // Reload: o estado em memória zera, mas o mês é o mesmo (localStorage sobrevive).
    resetSearchBudgetGuardForTests();
    await forceSearchBudgetRefreshForTests();
    expect(h.logAudit).toHaveBeenCalledTimes(1); // hoje: 2
  });

  it('cada checagem seguinte no mesmo mês também não reemite', async () => {
    h.rpc.mockResolvedValue({ data: 99, error: null });
    await forceSearchBudgetRefreshForTests();
    await forceSearchBudgetRefreshForTests();
    await forceSearchBudgetRefreshForTests();
    expect(h.logAudit).toHaveBeenCalledTimes(1);
  });
});
