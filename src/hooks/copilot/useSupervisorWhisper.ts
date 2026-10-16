import { useState, useCallback } from 'react';

export interface WhisperMessage {
  id: string;
  conversationId: string;
  supervisorId: string;
  supervisorName: string;
  text: string;
  sentAt: string;
  readAt: string | null;
}

export interface UseSupervisorWhisperOptions {
  conversationId: string;
  supervisorId?: string;
}

export interface SupervisorWhisperState {
  whispers: WhisperMessage[];
  unreadCount: number;
  isSending: boolean;
  error: string | null;
  sendWhisper: (text: string) => Promise<void>;
  markRead: (whisperId: string) => Promise<void>;
}

/**
 * CV-122 — Mensagem privada supervisor→vendedor (ESTENDE WhisperMode.tsx).
 * POST /api/radar-whisper para enviar; PATCH ./{id}/read para marcar lida.
 */
export function useSupervisorWhisper({
  conversationId,
  supervisorId,
}: UseSupervisorWhisperOptions): SupervisorWhisperState {
  const [whispers, setWhispers] = useState<WhisperMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unreadCount = whispers.filter(w => !w.readAt).length;

  const sendWhisper = useCallback(async (text: string) => {
    if (!supervisorId || !text.trim()) return;
    setIsSending(true);
    setError(null);
    try {
      const res = await fetch('/api/radar-whisper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, supervisor_id: supervisorId, text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const msg: WhisperMessage = await res.json();
      setWhispers(prev => [...prev, msg]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar whisper');
    } finally {
      setIsSending(false);
    }
  }, [conversationId, supervisorId]);

  const markRead = useCallback(async (whisperId: string) => {
    try {
      const res = await fetch(`/api/radar-whisper/${whisperId}/read`, { method: 'PATCH' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setWhispers(prev =>
        prev.map(w => w.id === whisperId ? { ...w, readAt: new Date().toISOString() } : w)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao marcar lida');
    }
  }, []);

  return { whispers, unreadCount, isSending, error, sendWhisper, markRead };
}
