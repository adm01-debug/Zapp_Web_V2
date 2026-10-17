import { useState, useCallback } from 'react';

export type RolePlayCharacter =
  | 'hr-budget-constrained'
  | 'marketing-deadline-pressure'
  | 'procurement-skeptical'
  | 'ceo-time-limited'
  | 'reseller-price-hunter';

export interface RolePlayMessage {
  role: 'vendor' | 'buyer';
  text: string;
  timestamp: string;
  radarHint?: string;
}

export interface RolePlaySession {
  sessionId: string;
  character: RolePlayCharacter;
  characterDescription: string;
  messages: RolePlayMessage[];
  radarHints: string[];
  startedAt: string;
  endedAt: string | null;
  score: number | null;
}

export interface UseRolePlaySimulatorOptions {
  vendorId: string;
  onSessionEnd?: (session: RolePlaySession) => void;
}

export interface RolePlaySimulatorState {
  session: RolePlaySession | null;
  isStarting: boolean;
  isSending: boolean;
  error: string | null;
  startSession: (character: RolePlayCharacter) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  endSession: () => Promise<void>;
}

/**
 * CV-126 — Simulador de role-play com 5 personas (DELEGADA IA-177).
 * POST /api/radar-roleplay/start, /api/radar-roleplay/{id}/message, /api/radar-roleplay/{id}/end.
 */
export function useRolePlaySimulator({
  vendorId,
  onSessionEnd,
}: UseRolePlaySimulatorOptions): RolePlaySimulatorState {
  const [session, setSession] = useState<RolePlaySession | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSession = useCallback(async (character: RolePlayCharacter) => {
    setIsStarting(true);
    setError(null);
    try {
      const res = await fetch('/api/radar-roleplay/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: vendorId, character }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RolePlaySession = await res.json();
      setSession(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao iniciar simulação');
    } finally {
      setIsStarting(false);
    }
  }, [vendorId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!session) return;
    setIsSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/radar-roleplay/${session.sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: RolePlaySession = await res.json();
      setSession(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar mensagem');
    } finally {
      setIsSending(false);
    }
  }, [session]);

  const endSession = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetch(`/api/radar-roleplay/${session.sessionId}/end`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ended: RolePlaySession = await res.json();
      setSession(ended);
      onSessionEnd?.(ended);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao finalizar simulação');
    }
  }, [session, onSessionEnd]);

  return { session, isStarting, isSending, error, startSession, sendMessage, endSession };
}
