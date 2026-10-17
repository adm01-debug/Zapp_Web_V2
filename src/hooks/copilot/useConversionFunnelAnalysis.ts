import { useState, useCallback } from 'react';

export interface FunnelStage {
  stage: string;
  label: string;
  totalConversations: number;
  convertedToNext: number;
  conversionRate: number;
  avgTimeInStageMs: number;
  topDropOffReason: string | null;
}

export interface ConversionFunnel {
  vendorId: string;
  periodDays: number;
  stages: FunnelStage[];
  overallConversionRate: number;
  weakestStage: string;
  generatedAt: string;
}

export interface UseConversionFunnelAnalysisOptions {
  vendorId: string;
  periodDays?: number;
}

export interface ConversionFunnelAnalysisState {
  funnel: ConversionFunnel | null;
  isFetching: boolean;
  error: string | null;
  fetchFunnel: () => Promise<void>;
}

/**
 * CV-137 — Análise de funil de conversão por estágio BRINDE.
 * GET /api/radar-conversion-funnel?vendor_id=...&period_days=...
 */
export function useConversionFunnelAnalysis({
  vendorId,
  periodDays = 30,
}: UseConversionFunnelAnalysisOptions): ConversionFunnelAnalysisState {
  const [funnel, setFunnel] = useState<ConversionFunnel | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFunnel = useCallback(async () => {
    setIsFetching(true);
    setError(null);
    try {
      const res = await fetch(`/api/radar-conversion-funnel?vendor_id=${vendorId}&period_days=${periodDays}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ConversionFunnel = await res.json();
      setFunnel(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar funil');
    } finally {
      setIsFetching(false);
    }
  }, [vendorId, periodDays]);

  return { funnel, isFetching, error, fetchFunnel };
}
