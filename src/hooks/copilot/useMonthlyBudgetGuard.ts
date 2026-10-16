import { useState, useEffect, useCallback } from 'react';

export interface UseMonthlyBudgetGuardOptions {
  monthlyBudgetUsd: number;
  warningThresholdPct?: number;
  criticalThresholdPct?: number;
  onWarning?: (spentUsd: number, budgetUsd: number) => void;
  onCritical?: (spentUsd: number, budgetUsd: number) => void;
  onExceeded?: (spentUsd: number, budgetUsd: number) => void;
}

export type BudgetStatus = 'ok' | 'warning' | 'critical' | 'exceeded';

export interface MonthlyBudgetGuardResult {
  spentUsd: number;
  remainingUsd: number;
  usedPct: number;
  status: BudgetStatus;
  isLoading: boolean;
  error: string | null;
  addSpend: (amountUsd: number) => void;
  reset: () => void;
}

/**
 * CV-142 — Guarda de orçamento mensal com alertas.
 * Tracks cumulative spend against a monthly budget ceiling and fires callbacks
 * at configurable thresholds (warning, critical, exceeded).
 */
export function useMonthlyBudgetGuard({
  monthlyBudgetUsd,
  warningThresholdPct = 0.7,
  criticalThresholdPct = 0.9,
  onWarning,
  onCritical,
  onExceeded,
}: UseMonthlyBudgetGuardOptions): MonthlyBudgetGuardResult {
  const [spentUsd, setSpentUsd] = useState(0);
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  const usedPct = monthlyBudgetUsd > 0 ? spentUsd / monthlyBudgetUsd : 0;

  const status: BudgetStatus =
    usedPct >= 1
      ? 'exceeded'
      : usedPct >= criticalThresholdPct
      ? 'critical'
      : usedPct >= warningThresholdPct
      ? 'warning'
      : 'ok';

  useEffect(() => {
    if (status === 'warning') onWarning?.(spentUsd, monthlyBudgetUsd);
    else if (status === 'critical') onCritical?.(spentUsd, monthlyBudgetUsd);
    else if (status === 'exceeded') onExceeded?.(spentUsd, monthlyBudgetUsd);
  }, [status, spentUsd, monthlyBudgetUsd, onWarning, onCritical, onExceeded]);

  const addSpend = useCallback((amountUsd: number) => {
    setSpentUsd(prev => prev + amountUsd);
  }, []);

  const reset = useCallback(() => setSpentUsd(0), []);

  return {
    spentUsd,
    remainingUsd: Math.max(0, monthlyBudgetUsd - spentUsd),
    usedPct,
    status,
    isLoading,
    error,
    addSpend,
    reset,
  };
}
