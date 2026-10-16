/**
 * CV-032 — Hook de assinatura Realtime para copilot_sessions.
 * Mantém o estado B·R·I·N·D·E, etapa, temperatura e stakeholders
 * sincronizados em tempo real.
 */
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CopilotSessionState {
  id: string;
  stage: 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6';
  brinde_state: {
    B: string | null; R: string | null; I: string | null;
    N: string | null; D: string | null; E: string | null;
  };
  brinde_evidence: {
    B: string | null; R: string | null; I: string | null;
    N: string | null; D: string | null; E: string | null;
  };
  temperature: number;
  state_version: number;
  decision_role: string | null;
  occasion: string | null;
  comm_style: string[];
  stakeholders: Array<{ name: string; role: string; first_mention_msg_id?: string }>;
}

interface UseCopilotSessionOptions {
  contactId: string | undefined;
  whatsappConnectionId: string | undefined;
}

interface UseCopilotSessionResult {
  session: CopilotSessionState | null;
  loading: boolean;
}

export function useCopilotSession({
  contactId,
  whatsappConnectionId,
}: UseCopilotSessionOptions): UseCopilotSessionResult {
  const [session, setSession] = useState<CopilotSessionState | null>(null);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!contactId || !whatsappConnectionId) {
      setSession(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function fetchSession() {
      const { data, error } = await supabase
        .from('copilot_sessions')
        .select('id, stage, brinde_state, brinde_evidence, temperature, state_version, decision_role, occasion, comm_style, stakeholders')
        .eq('contact_id', contactId!)
        .eq('whatsapp_connection_id', whatsappConnectionId!)
        .maybeSingle();

      if (cancelled) return;
      setLoading(false);
      if (!error && data) setSession(data as CopilotSessionState);
    }

    fetchSession();

    // Realtime: escuta INSERT e UPDATE em copilot_sessions para este contato
    const channel = supabase
      .channel(`copilot_session:${contactId}:${whatsappConnectionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'copilot_sessions',
          filter: `contact_id=eq.${contactId}`,
        },
        (payload) => {
          if (cancelled) return;
          if (payload.new) {
            setSession((prev) => {
              const next = payload.new as CopilotSessionState;
              // Só atualiza se a versão é mais recente
              if (!prev || next.state_version >= prev.state_version) return next;
              return prev;
            });
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [contactId, whatsappConnectionId]);

  return { session, loading };
}
