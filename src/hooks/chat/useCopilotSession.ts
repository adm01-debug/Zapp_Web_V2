import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { SUPABASE_URL } from '@/config/supabase';

export interface CopilotSession {
  id: string;
  conversation_id: string;
  contact_id: string;
  brinde_meter: number;
  sale_stage: string;
  temperature: number;
  state_version: number;
  brinde_budget: string | null;
  brinde_responsible: string | null;
  brinde_intention: string | null;
  brinde_quantity: number | null;
  brinde_deadline: string | null;
  brinde_delivery: string | null;
  decision_role: string | null;
  occasion: string | null;
  comm_style: string[];
  stakeholders: Array<{ name: string; role?: string }>;
  last_tick_at: string | null;
}

export interface CopilotInsight {
  id: string;
  insight_type: 'suggestion' | 'warning' | 'info' | 'celebration';
  content: string;
  created_at: string;
}

export function useCopilotSession(conversationId: string | undefined) {
  const { user } = useAuth();

  const sessionQuery = useQuery({
    queryKey: ['copilot-session', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;
      const { data, error } = await supabase
        .from('copilot_sessions')
        .select('*')
        .eq('conversation_id', conversationId)
        .maybeSingle();
      if (error) throw error;
      return data as CopilotSession | null;
    },
    enabled: Boolean(conversationId && user),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const insightsQuery = useQuery({
    queryKey: ['copilot-insights', sessionQuery.data?.id],
    queryFn: async () => {
      const sessionId = sessionQuery.data?.id;
      if (!sessionId) return [];
      const { data, error } = await supabase
        .from('copilot_insights')
        .select('id, insight_type, content, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as CopilotInsight[];
    },
    enabled: Boolean(sessionQuery.data?.id),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const queryClient = useQueryClient();

  const tickMutation = useMutation({
    mutationFn: async (params: { contactId?: string; lastClientMessage?: string }) => {
      if (!conversationId) throw new Error('conversationId required');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/copilot-live`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          contact_id: params.contactId,
          last_client_message: params.lastClientMessage,
          session_id: sessionQuery.data?.id,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<{
        ok: boolean;
        session_id: string;
        insight: { id: string; type: string; content: string; key_moments: string[]; sale_stage: string; temperature: number } | null;
      }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['copilot-session', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['copilot-insights'] });
    },
  });

  return {
    session: sessionQuery.data,
    insights: insightsQuery.data ?? [],
    isLoading: sessionQuery.isLoading,
    isError: sessionQuery.isError,
    tick: tickMutation.mutate,
    isTicking: tickMutation.isPending,
    lastTickInsight: tickMutation.data?.insight ?? null,
  };
}
