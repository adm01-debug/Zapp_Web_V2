import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

export interface ConversationAnalysis {
  id: string;
  contact_id: string;
  analyzed_by: string | null;
  summary: string;
  status: string;
  key_points: string[];
  next_steps: string[];
  sentiment: 'positivo' | 'neutro' | 'negativo' | 'critico';
  sentiment_score: number;
  topics: string[];
  urgency: 'baixa' | 'media' | 'alta' | 'critica' | null;
  customer_satisfaction: number;
  message_count: number;
  created_at: string;
}

/** `conversation_analyses.contact_id` é uuid. Mesmo padrão de `useWhisperCount`/`useCalls`. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Prefixo do cache das análises de conversa. Fica estável para que várias telas
 * (painel de IA, sentimento, SLA) compartilhem o mesmo resultado por contato.
 */
export const conversationAnalysesQueryKey = 'conversation-analyses' as const;

/**
 * Análises de conversa de um contato, com cache compartilhado pelo react-query.
 * O mesmo conteúdo era recarregado a cada montagem (painel, SLA, sentimento);
 * agora a consulta é uma só por contato dentro do `staleTime`.
 *
 * Id que não é uuid (ex.: link direto com JID vindo do roteador) não dispara
 * consulta — o PostgREST responderia 400 —, e o mesmo vale para `null`.
 */
export function useConversationAnalyses(contactId: string | null) {
  const queryClient = useQueryClient();
  const key = [conversationAnalysesQueryKey, contactId] as const;

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversation_analyses')
        .select('*')
        .eq('contact_id', contactId as string)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      return (data || []) as ConversationAnalysis[];
    },
    // Só consulta com id de contato válido; sem isso a consulta nem sai do navegador.
    enabled: !!contactId && isValidUUID(contactId),
    staleTime: 30_000,
  });

  const analyses = query.data ?? [];
  const loading = query.isLoading;
  const error = query.error
    ? query.error instanceof Error
      ? query.error.message
      : String(query.error)
    : null;

  const refetch = useCallback(async () => {
    // Mantém o contrato anterior: `refetch` nunca rejeita (o erro vem pelo `error`).
    await query.refetch();
  }, [query.refetch]);

  const saveAnalysis = async (
    analysis: Omit<ConversationAnalysis, 'id' | 'created_at' | 'analyzed_by'>
  ) => {
    try {
      // Get current user's profile id
      const {
        data: { user },
      } = await supabase.auth.getUser();
      let profileId: string | null = null;

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        profileId = profile?.id || null;
      }

      const { data, error } = await supabase
        .from('conversation_analyses')
        .insert({
          ...analysis,
          analyzed_by: profileId,
        })
        .select()
        .single();

      if (error) throw error;

      // A lista do contato (e de qualquer outra tela montada) passa a ler do cache:
      // invalida o prefixo para todas revalidarem em vez de só a instância local.
      await queryClient.invalidateQueries({ queryKey: [conversationAnalysesQueryKey] });

      return data as ConversationAnalysis;
    } catch (err) {
      log.error('Error saving analysis:', err);
      throw err;
    }
  };

  const getLatestAnalysis = () => {
    return analyses[0] || null;
  };

  const getSentimentTrend = () => {
    if (analyses.length < 2) return null;

    const recent = analyses.slice(0, 5);
    const avgRecent = recent.reduce((sum, a) => sum + a.sentiment_score, 0) / recent.length;

    const older = analyses.slice(5, 10);
    if (older.length === 0) return null;

    const avgOlder = older.reduce((sum, a) => sum + a.sentiment_score, 0) / older.length;

    const diff = avgRecent - avgOlder;

    if (diff > 5) return 'improving';
    if (diff < -5) return 'declining';
    return 'stable';
  };

  return {
    analyses,
    loading,
    error,
    saveAnalysis,
    getLatestAnalysis,
    getSentimentTrend,
    refetch,
  };
}
