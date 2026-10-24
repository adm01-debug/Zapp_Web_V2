/**
 * Carga de cada atendente: quantas conversas ATRIBUÍDAS estão aguardando atendente.
 *
 * Régua canônica (não uma nova): é o mesmo "Pendentes" do filtro da inbox
 * (`src/hooks/inbox/useInboxFilters.ts`), o estado de espera do FSM persistido
 * `contacts.conversation_status === 'waiting'` — não a derivação antiga por
 * `messages.length`. Contato sem dono é espera da FILA, não carga de um atendente;
 * contato excluído (`deleted_at`) é cadastro morto e não entra.
 *
 * Uma consulta agregada para TODA a equipe (nunca uma por atendente) e leitura
 * paginada: um `select` sem `range` devolve só a primeira página e a pendência
 * viraria um subtotal silencioso (mesmo modo de falha que a capacidade tinha,
 * R2-AUTH-020). Leitura incompleta FALHA em vez de exibir um número menor que o
 * real — o hook de capacidade em `src/hooks/crm/useAgents.ts` já faz essa escolha.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';

/** Mapa `profile_id -> nº de conversas aguardando atendente`. */
export type AgentPendingCounts = Record<string, number>;

export const AGENT_PENDING_COUNTS_KEY = ['agents-pending-counts'] as const;

export function useAgentPendingCounts() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: AGENT_PENDING_COUNTS_KEY,
    queryFn: async (): Promise<AgentPendingCounts> => {
      const { rows, incomplete, error: readError } = await fetchAllRows<{ assigned_to: string | null }>(
        (from, to) => supabase
          .from('contacts')
          .select('assigned_to')
          .not('assigned_to', 'is', null)
          .eq('conversation_status', 'waiting')
          .is('deleted_at', null)
          .order('id')
          .range(from, to),
      );

      if (incomplete) {
        throw new Error(
          readError?.message ?? 'Leitura de conversas pendentes excedeu o limite de segurança',
        );
      }

      const counts: AgentPendingCounts = {};
      rows.forEach((contact) => {
        if (contact.assigned_to) {
          counts[contact.assigned_to] = (counts[contact.assigned_to] || 0) + 1;
        }
      });
      return counts;
    },
  });

  const pendingCounts = useMemo<AgentPendingCounts>(() => data ?? {}, [data]);

  return { pendingCounts, isLoading, error, refetch };
}
