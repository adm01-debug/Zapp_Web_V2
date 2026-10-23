import { useState, useEffect, useCallback } from 'react';

export interface WeeklyVendorReport {
  vendorId: string;
  weekOf: string;
  avgResponseTimeMs: number;
  brindeAvgScore: number;
  topObjections: string[];
  radarUsageRate: number;
  ordersCount: number;
  ordersValue: number;
  conversationsCount: number;
  generatedAt: string;
}

export interface UseWeeklyVendorReportOptions {
  vendorId: string;
  autoLoadLatest?: boolean;
}

export interface WeeklyVendorReportState {
  report: WeeklyVendorReport | null;
  history: WeeklyVendorReport[];
  isFetching: boolean;
  error: string | null;
  fetchReport: (weekOf: string) => Promise<void>;
  fetchHistory: () => Promise<void>;
}

/**
 * CV-129 — Relatório semanal de desempenho individual do vendedor.
 * GET /api/radar-weekly-report?vendor_id=...&week_of=...
 */
export function useWeeklyVendorReport({
  vendorId,
  autoLoadLatest = false,
}: UseWeeklyVendorReportOptions): WeeklyVendorReportState {
  const [report, setReport] = useState<WeeklyVendorReport | null>(null);
  const [history, setHistory] = useState<WeeklyVendorReport[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async (weekOf: string) => {
    setIsFetching(true);
    setError(null);
    try {
      const res = await fetch(`/api/radar-weekly-report?vendor_id=${vendorId}&week_of=${weekOf}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: WeeklyVendorReport = await res.json();
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar relatório');
    } finally {
      setIsFetching(false);
    }
  }, [vendorId]);

  const fetchHistory = useCallback(async () => {
    setIsFetching(true);
    setError(null);
    try {
      const res = await fetch(`/api/radar-weekly-report/history?vendor_id=${vendorId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: WeeklyVendorReport[] = await res.json();
      setHistory(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar histórico');
    } finally {
      setIsFetching(false);
    }
  }, [vendorId]);

  useEffect(() => {
    if (autoLoadLatest) {
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(now.getDate() - now.getDay() + 1);
      fetchReport(monday.toISOString().slice(0, 10));
    }
  }, [autoLoadLatest, fetchReport]);

  return { report, history, isFetching, error, fetchReport, fetchHistory };
}
