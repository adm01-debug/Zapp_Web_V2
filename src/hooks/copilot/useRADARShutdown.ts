import { useState, useCallback } from 'react';

export interface ShutdownReport {
  initiatedAt: string;
  completedAt: string;
  totalConversationsProcessed: number;
  totalSuggestionsGenerated: number;
  totalSuggestionsApplied: number;
  overallApplicationRate: number;
  estimatedRevenueUpliftBrl: number;
  pilotDurationDays: number;
  topPerformingFeatures: string[];
  featuresForImprovement: string[];
  recommendedForFullRollout: boolean;
  summaryText: string;
}

export type ShutdownPhase =
  | 'idle'
  | 'draining'
  | 'generating-report'
  | 'completed'
  | 'failed';

export interface UseRADARShutdownOptions {
  onReportReady?: (report: ShutdownReport) => void;
  onShutdownComplete?: () => void;
}

export interface RADARShutdownResult {
  phase: ShutdownPhase;
  report: ShutdownReport | null;
  isShuttingDown: boolean;
  error: string | null;
  initiateShutdown: () => Promise<void>;
  cancelShutdown: () => void;
}

/**
 * CV-150 — Desligamento controlado e geração de relatório final do RADAR.
 * Orchestrates a graceful shutdown: drains in-flight suggestions, generates
 * the final pilot report via /api/radar-shutdown, and fires callbacks.
 * This is the terminal hook of the RADAR sales copilot (Fase 15, CV-150).
 */
export function useRADARShutdown({
  onReportReady,
  onShutdownComplete,
}: UseRADARShutdownOptions = {}): RADARShutdownResult {
  const [phase, setPhase] = useState<ShutdownPhase>('idle');
  const [report, setReport] = useState<ShutdownReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  const initiateShutdown = useCallback(async () => {
    if (phase !== 'idle') return;
    setCancelled(false);
    setError(null);
    setPhase('draining');

    // Allow a tick for in-flight suggestions to finish
    await new Promise<void>(resolve => setTimeout(resolve, 500));

    if (cancelled) {
      setPhase('idle');
      return;
    }

    setPhase('generating-report');
    try {
      const res = await fetch('/api/radar-shutdown', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ShutdownReport = await res.json();
      setReport(data);
      onReportReady?.(data);
      setPhase('completed');
      onShutdownComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar relatório de encerramento');
      setPhase('failed');
    }
  }, [phase, cancelled, onReportReady, onShutdownComplete]);

  const cancelShutdown = useCallback(() => {
    setCancelled(true);
    if (phase === 'draining') setPhase('idle');
  }, [phase]);

  return {
    phase,
    report,
    isShuttingDown: phase === 'draining' || phase === 'generating-report',
    error,
    initiateShutdown,
    cancelShutdown,
  };
}
