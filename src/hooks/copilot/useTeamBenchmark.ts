import { useState, useCallback } from 'react';

export interface BenchmarkEntry {
  vendorId: string;
  isCurrentUser: boolean;
  percentile: number;
  avgScore: number;
  ordersCount: number;
  radarUsageRate: number;
  brindeCompletionRate: number;
}

export interface TeamBenchmark {
  teamId: string;
  weekOf: string;
  entries: BenchmarkEntry[];
  teamAvgScore: number;
  teamAvgOrdersCount: number;
}

export interface UseTeamBenchmarkOptions {
  teamId: string;
  vendorId: string;
}

export interface TeamBenchmarkState {
  benchmark: TeamBenchmark | null;
  currentUserEntry: BenchmarkEntry | null;
  isFetching: boolean;
  error: string | null;
  fetchBenchmark: (weekOf?: string) => Promise<void>;
}

/**
 * CV-136 — Benchmark anônimo da equipe com percentis.
 * GET /api/radar-team-benchmark?team_id=...&vendor_id=...&week_of=...
 */
export function useTeamBenchmark({ teamId, vendorId }: UseTeamBenchmarkOptions): TeamBenchmarkState {
  const [benchmark, setBenchmark] = useState<TeamBenchmark | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentUserEntry = benchmark?.entries.find(e => e.isCurrentUser) ?? null;

  const fetchBenchmark = useCallback(async (weekOf?: string) => {
    setIsFetching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ team_id: teamId, vendor_id: vendorId });
      if (weekOf) params.set('week_of', weekOf);
      const res = await fetch(`/api/radar-team-benchmark?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: TeamBenchmark = await res.json();
      setBenchmark(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar benchmark');
    } finally {
      setIsFetching(false);
    }
  }, [teamId, vendorId]);

  return { benchmark, currentUserEntry, isFetching, error, fetchBenchmark };
}
