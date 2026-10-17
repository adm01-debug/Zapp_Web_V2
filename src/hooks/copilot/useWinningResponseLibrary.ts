import { useState, useCallback } from 'react';

export interface WinningResponse {
  id: string;
  text: string;
  context: string;
  stage: string;
  objectiveType: 'next-step' | 'close' | 'objection-handling' | 'follow-up';
  approvedBy: string;
  approvedAt: string;
  usageCount: number;
  successRate: number;
}

export interface PendingCandidateResponse {
  id: string;
  conversationId: string;
  text: string;
  context: string;
  submittedBy: string;
  submittedAt: string;
  outcome: 'order' | 'next-step' | 'unknown';
}

export interface UseWinningResponseLibraryOptions {
  isSupervisor?: boolean;
  vendorId?: string;
}

export interface WinningResponseLibraryState {
  library: WinningResponse[];
  pendingCandidates: PendingCandidateResponse[];
  isFetching: boolean;
  error: string | null;
  fetchLibrary: (stage?: string) => Promise<void>;
  fetchPendingCandidates: () => Promise<void>;
  approveCandidate: (candidateId: string) => Promise<void>;
  rejectCandidate: (candidateId: string, reason: string) => Promise<void>;
  submitCandidate: (conversationId: string, text: string, context: string, outcome: PendingCandidateResponse['outcome']) => Promise<void>;
}

/**
 * CV-130 — Biblioteca de respostas vencedoras aprovadas pelo supervisor.
 * GET /api/radar-winning-library; POST para aprovação, rejeição e submissão.
 * Nada entra na biblioteca sem aprovação humana (guarda isSupervisor).
 */
export function useWinningResponseLibrary({
  isSupervisor = false,
  vendorId,
}: UseWinningResponseLibraryOptions): WinningResponseLibraryState {
  const [library, setLibrary] = useState<WinningResponse[]>([]);
  const [pendingCandidates, setPendingCandidates] = useState<PendingCandidateResponse[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLibrary = useCallback(async (stage?: string) => {
    setIsFetching(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (stage) params.set('stage', stage);
      const res = await fetch(`/api/radar-winning-library?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: WinningResponse[] = await res.json();
      setLibrary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar biblioteca');
    } finally {
      setIsFetching(false);
    }
  }, []);

  const fetchPendingCandidates = useCallback(async () => {
    if (!isSupervisor) return;
    setIsFetching(true);
    try {
      const res = await fetch('/api/radar-winning-library/pending');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PendingCandidateResponse[] = await res.json();
      setPendingCandidates(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar candidatos');
    } finally {
      setIsFetching(false);
    }
  }, [isSupervisor]);

  const approveCandidate = useCallback(async (candidateId: string) => {
    if (!isSupervisor) return;
    const res = await fetch(`/api/radar-winning-library/${candidateId}/approve`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setPendingCandidates(prev => prev.filter(c => c.id !== candidateId));
    await fetchLibrary();
  }, [isSupervisor, fetchLibrary]);

  const rejectCandidate = useCallback(async (candidateId: string, reason: string) => {
    if (!isSupervisor) return;
    const res = await fetch(`/api/radar-winning-library/${candidateId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setPendingCandidates(prev => prev.filter(c => c.id !== candidateId));
  }, [isSupervisor]);

  const submitCandidate = useCallback(async (
    conversationId: string,
    text: string,
    context: string,
    outcome: PendingCandidateResponse['outcome'],
  ) => {
    if (!vendorId) return;
    const res = await fetch('/api/radar-winning-library/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId, vendor_id: vendorId, text, context, outcome }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }, [vendorId]);

  return { library, pendingCandidates, isFetching, error, fetchLibrary, fetchPendingCandidates, approveCandidate, rejectCandidate, submitCandidate };
}
