import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockRpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

import { logAudit } from '@/lib/audit';
import {
  isSearchBudgetOk,
  resetSearchBudgetGuardForTests,
  forceSearchBudgetRefreshForTests,
  MONTHLY_SESSION_LIMIT,
} from '../mapboxCostGuard';

describe('mapboxCostGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSearchBudgetGuardForTests();
    mockRpc.mockReset();
    vi.mocked(logAudit).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('estado inicial é otimista: libera o autocomplete antes de qualquer checagem', () => {
    expect(isSearchBudgetOk()).toBe(true);
  });

  it('abaixo do teto: continua liberado e não registra degradação', async () => {
    mockRpc.mockResolvedValue({ data: MONTHLY_SESSION_LIMIT - 10, error: null });
    await forceSearchBudgetRefreshForTests();
    expect(isSearchBudgetOk()).toBe(true);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('acima do teto: degrada e registra searchbox_cost_guard uma vez', async () => {
    mockRpc.mockResolvedValue({ data: MONTHLY_SESSION_LIMIT + 5, error: null });
    await forceSearchBudgetRefreshForTests();
    expect(isSearchBudgetOk()).toBe(false);
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith({
      action: 'searchbox_cost_guard',
      details: { event: 'degraded', limit: MONTHLY_SESSION_LIMIT, count: MONTHLY_SESSION_LIMIT + 5 },
    });
  });

  it('continuar acima do teto em checagens seguintes não gera novo evento', async () => {
    mockRpc.mockResolvedValue({ data: MONTHLY_SESSION_LIMIT + 5, error: null });
    await forceSearchBudgetRefreshForTests();
    mockRpc.mockResolvedValue({ data: MONTHLY_SESSION_LIMIT + 20, error: null });
    await forceSearchBudgetRefreshForTests();
    expect(isSearchBudgetOk()).toBe(false);
    expect(logAudit).toHaveBeenCalledTimes(1);
  });

  it('falha na RPC mantém o último estado conhecido, sem lançar', async () => {
    mockRpc.mockRejectedValue(new Error('network'));
    await expect(forceSearchBudgetRefreshForTests()).resolves.toBeUndefined();
    expect(isSearchBudgetOk()).toBe(true);
    expect(logAudit).not.toHaveBeenCalled();
  });
});
