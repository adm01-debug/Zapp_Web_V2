/**
 * useAgentReassignment
 *
 * Exposes RPCs for reassigning absent and overloaded agents.
 *
 * Paridade V3: reatribuir em lote muda `contacts.assigned_to` (e o estado de
 * carga de cada atendente), então o sucesso da RPC precisa invalidar o cache —
 * sem isso a lista de contatos, as abas de conversa e o War Room continuavam
 * mostrando o atendente antigo até um reload.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Chaves de cache afetadas por uma reatribuição em lote.
 *
 * São os nomes REAIS usados no repositório: `['contacts']` e `['conversations']`
 * não existem (o prefixo não casa com `contacts-search`, por exemplo), então
 * invalidação por eles seria no-op.
 */
export const CHAVES_AFETADAS_POR_REATRIBUICAO: readonly (readonly string[])[] = [
  // Contatos: lista/filtro e os contadores saem de `contacts.assigned_to`.
  ['contacts-search'],
  ['contacts-kpi'],
  ['contacts-type-counts'],
  // Conversas: abas por contato ("Meus" muda) e a carga por atendente.
  ['conversation-tab-counts'],
  ['agents-active-chats'],
  ['agent-stats'],
  // War Room: alertas, agentes e filas leem essa mesma carga.
  ['warroom-alerts'],
  ['warroom-agents'],
  ['warroom-queues'],
];

export function useAgentReassignment() {
  const queryClient = useQueryClient();

  const invalidarAfetadas = () =>
    Promise.all(
      CHAVES_AFETADAS_POR_REATRIBUICAO.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey: [...queryKey] }),
      ),
    );

  const reassignAbsent = useMutation({
    mutationFn: async (inactiveMinutes: number = 30) => {
      const { data, error } = await supabase.rpc('reassign_absent_agents', {
        inactive_minutes: inactiveMinutes,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: async (count) => {
      await invalidarAfetadas();
      if (count > 0) {
        toast.success(`${count} conversa(s) reatribuída(s) de agentes ausentes`);
      } else {
        toast.info('Nenhum agente ausente com conversas para reatribuir');
      }
    },
    onError: () => toast.error('Erro ao reatribuir conversas de agentes ausentes'),
  });

  const reassignOverloaded = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('reassign_overloaded_agents');
      if (error) throw error;
      return data as number;
    },
    onSuccess: async (count) => {
      await invalidarAfetadas();
      if (count > 0) {
        toast.success(`${count} conversa(s) reatribuída(s) de agentes sobrecarregados`);
      } else {
        toast.info('Nenhum agente sobrecarregado no momento');
      }
    },
    onError: () => toast.error('Erro ao reatribuir conversas de agentes sobrecarregados'),
  });

  return {
    reassignAbsent,
    reassignOverloaded,
    isLoading: reassignAbsent.isPending || reassignOverloaded.isPending,
  };
}
