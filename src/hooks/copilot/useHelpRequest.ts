import { useState, useCallback } from 'react';

export interface RadarBriefing {
  contactName: string;
  stage: string;
  temperature: number;
  estimatedValue: number;
  brindeSummary: Partial<Record<'B' | 'R' | 'I' | 'N' | 'D' | 'E', string>>;
  topObjection: string | null;
  suggestedNextStep: string | null;
}

export interface HelpRequest {
  id: string;
  conversationId: string;
  vendorId: string;
  supervisorId: string | null;
  radarBriefing: RadarBriefing;
  status: 'pending' | 'acknowledged' | 'resolved';
  requestedAt: string;
  acknowledgedAt: string | null;
  responseTimeMs: number | null;
}

export interface UseHelpRequestOptions {
  conversationId: string;
  vendorId: string;
  radarBriefing: RadarBriefing;
}

export interface HelpRequestState {
  activeRequest: HelpRequest | null;
  isSending: boolean;
  error: string | null;
  requestHelp: () => Promise<void>;
  cancel: () => Promise<void>;
}

/**
 * CV-123 — Solicitação de ajuda ao supervisor em tempo real.
 * POST /api/radar-help-request com briefing BRINDE completo.
 * DELETE para cancelar pedido pendente.
 */
export function useHelpRequest({
  conversationId,
  vendorId,
  radarBriefing,
}: UseHelpRequestOptions): HelpRequestState {
  const [activeRequest, setActiveRequest] = useState<HelpRequest | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestHelp = useCallback(async () => {
    if (activeRequest?.status === 'pending') return;
    setIsSending(true);
    setError(null);
    try {
      const res = await fetch('/api/radar-help-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          vendor_id: vendorId,
          radar_briefing: radarBriefing,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const req: HelpRequest = await res.json();
      setActiveRequest(req);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao solicitar ajuda');
    } finally {
      setIsSending(false);
    }
  }, [conversationId, vendorId, radarBriefing, activeRequest]);

  const cancel = useCallback(async () => {
    if (!activeRequest) return;
    try {
      const res = await fetch(`/api/radar-help-request/${activeRequest.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setActiveRequest(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao cancelar pedido');
    }
  }, [activeRequest]);

  return { activeRequest, isSending, error, requestHelp, cancel };
}
