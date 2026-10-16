import { useState, useCallback } from 'react';

export interface ImpactMetric {
  metric: string;
  label: string;
  withRadar: number;
  withoutRadar: number;
  uplift: number;
  upliftPct: number;
  isSignificant: boolean;
}

export interface RADARImpactReport {
  teamId: string;
  periodStart: string;
  periodEnd: string;
  radarGroup: { vendorCount: number; conversationsCount: number };
  controlGroup: { vendorCount: number; conversationsCount: number };
  metrics: ImpactMetric[];
  headline: string;
  generatedAt: string;
}

export interface UseRADARImpactReportOptions {
  teamId: string;
  periodDays?: number;
}

export interface RADARImpactReportState {
  report: RADARImpactReport | null;
  isFetching: boolean;
  error: string | null;
  fetchReport: () => Promise<void>;
}

/**
 * CV-138 — Relatório de impacto do RADAR vs grupo controle (DELEGADA IA-200).
 * GET /api/radar-impact-report?team_id=...&period_days=...
 */
export function useRADARImpactReport({
  teamId,
  periodDays = 30,
}: UseRADARImpactReportOptions): RADARImpactReportState {
  const [report, setReport] = useState<RADARImpactReport | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setIsFetching(true);
    setError(null);
    try {
      const res = await fetch(`/api/radar-impact-report?team_id=${teamId}&period_days=${periodDays}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RADARImpactReport = await res.json();
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar relatório de impacto');
    } finally {
      setIsFetching(false);
    }
  }, [teamId, periodDays]);

  return { report, isFetching, error, fetchReport };
}
