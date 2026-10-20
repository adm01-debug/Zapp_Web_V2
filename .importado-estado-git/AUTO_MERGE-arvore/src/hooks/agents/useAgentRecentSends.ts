/**
 * Último envio de cada atendente: horário da mensagem mais recente ENVIADA
 * (`messages.sender === 'agent'`), agrupada pelo dono do envio (`messages.agent_id`).
 *
 * Por que uma janela: "último envio" serve para o supervisor ver quem está parado
 * agora — não é um relatório histórico. Lemos apenas os envios dos últimos
 * `RECENT_SENDS_WINDOW_DAYS` dias (mesma régua de `useCatalogRecentSends`); quem não
 * enviou nada na janela aparece como "sem envio recente", nunca como um "há X dias"
 * inventado a partir de um recorte arbitrário.
 *
 * Uma consulta agregada para TODA a equipe (nunca uma por atendente) e leitura
 * paginada: um `select` sem `range` devolveria só a primeira página e o mapa de
 * últimos envios ficaria incompleto em silêncio. Leitura incompleta FALHA, como o
 * hook de capacidade em `src/hooks/crm/useAgents.ts`.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';

/** Janela dos "envios recentes": fora dela o atendente aparece como sem envio recente. */
export const RECENT_SENDS_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mapa `profile_id -> ISO do último envio dentro da janela`. */
export type AgentRecentSends = Record<string, string>;

export const AGENT_RECENT_SENDS_KEY = ['agents-recent-sends'] as const;

export function useAgentRecentSends() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: AGENT_RECENT_SENDS_KEY,
    queryFn: async (): Promise<AgentRecentSends> => {
      const since = new Date(Date.now() - RECENT_SENDS_WINDOW_DAYS * DAY_MS).toISOString();
      const { rows, incomplete, error: readError } = await fetchAllRows<{
        agent_id: string | null;
        created_at: string;
      }>(
        (from, to) => supabase
          .from('messages')
          .select('agent_id, created_at')
          .eq('sender', 'agent')
          .not('agent_id', 'is', null)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to),
      );

      if (incomplete) {
        throw new Error(
          readError?.message ?? 'Leitura dos últimos envios excedeu o limite de segurança',
        );
      }

      const latest: AgentRecentSends = {};
      rows.forEach((message) => {
        if (!message.agent_id) return;
        const atual = latest[message.agent_id];
        if (!atual || message.created_at > atual) {
          latest[message.agent_id] = message.created_at;
        }
      });
      return latest;
    },
  });

  const recentSends = useMemo<AgentRecentSends>(() => data ?? {}, [data]);

  return { recentSends, isLoading, error, refetch };
}
