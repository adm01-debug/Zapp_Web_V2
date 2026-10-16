import { useState, useCallback } from 'react';

export interface WinningPlay {
  playId: string;
  name: string;
  description: string;
  usageCount: number;
  nextStepRate: number;
  orderRate: number;
  bestStages: string[];
  lastUsedAt: string;
}

export interface WinningPlayRankingReport {
  weekOf: string;
  topPlays: WinningPlay[];
  generatedAt: string;
}

export interface UseWinningPlayRankingOptions {
  teamId: string;
}

export interface WinningPlayRankingState {
  report: WinningPlayRankingReport | null;
  isFetching: boolean;
  error: string | null;
  fetchRanking: (weekOf?: string) => Promise<void>;
}

/**
 * CV-128 — Ranking semanal de jogadas campeãs da equipe.
 * GET /api/radar-winning-plays?team_id=...&week_of=...
 */
export function useWinningPlayRanking({ teamId }: UseWinningPlayRankingOptions): WinningPlayRankingState {
  const [report, setReport] = useState<WinningPlayRankingReport | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRanking = useCallback(async (weekOf?: string) => {
    setIsFetching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ team_id: teamId });
      if (weekOf) params.set('week_of', weekOf);
      const res = await fetch(`/api/radar-winning-plays?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: WinningPlayRankingReport = await res.json();
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar ranking');
    } finally {
      setIsFetching(false);
    }
  }, [teamId]);

  return { report, isFetching, error, fetchRanking };
}
