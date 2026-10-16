import { useState, useEffect, useCallback, useRef } from 'react';

export type HealthStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';

export interface ServiceHealth {
  service: string;
  status: HealthStatus;
  latencyMs: number;
  lastCheckedAt: string;
  errorMessage?: string;
}

export interface RADARHealthSnapshot {
  overallStatus: HealthStatus;
  services: ServiceHealth[];
  checkedAt: string;
  suggestionQueueDepth: number;
  errorRateLastMinute: number;
  p95LatencyMs: number;
}

export interface UseRADARHealthMonitorOptions {
  pollIntervalMs?: number;
  onDegraded?: (snapshot: RADARHealthSnapshot) => void;
  onCritical?: (snapshot: RADARHealthSnapshot) => void;
  onRecovered?: (snapshot: RADARHealthSnapshot) => void;
}

export interface RADARHealthMonitorResult {
  snapshot: RADARHealthSnapshot | null;
  isLoading: boolean;
  error: string | null;
  isMonitoring: boolean;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  checkNow: () => Promise<void>;
}

/**
 * CV-149 — Monitor de saúde do sistema RADAR.
 * Polls /api/radar-health at a configurable interval and fires callbacks
 * when overall status transitions between healthy/degraded/critical.
 */
export function useRADARHealthMonitor({
  pollIntervalMs = 60_000,
  onDegraded,
  onCritical,
  onRecovered,
}: UseRADARHealthMonitorOptions = {}): RADARHealthMonitorResult {
  const [snapshot, setSnapshot] = useState<RADARHealthSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const prevStatusRef = useRef<HealthStatus>('unknown');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkNow = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/radar-health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RADARHealthSnapshot = await res.json();
      setSnapshot(data);

      const prev = prevStatusRef.current;
      const curr = data.overallStatus;
      if (prev !== curr) {
        if (curr === 'degraded') onDegraded?.(data);
        if (curr === 'critical') onCritical?.(data);
        if (curr === 'healthy' && (prev === 'degraded' || prev === 'critical')) onRecovered?.(data);
        prevStatusRef.current = curr;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao verificar saúde do RADAR');
    } finally {
      setIsLoading(false);
    }
  }, [onDegraded, onCritical, onRecovered]);

  const startMonitoring = useCallback(() => {
    if (intervalRef.current) return;
    setIsMonitoring(true);
    checkNow();
    intervalRef.current = setInterval(checkNow, pollIntervalMs);
  }, [checkNow, pollIntervalMs]);

  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsMonitoring(false);
  }, []);

  useEffect(() => () => stopMonitoring(), [stopMonitoring]);

  return { snapshot, isLoading, error, isMonitoring, startMonitoring, stopMonitoring, checkNow };
}
