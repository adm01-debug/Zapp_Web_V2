import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import { invalidateContactsAggregates } from './contactsAggregates';
import { contactCrm360Key } from './useContactCrm360';

const contactEnrichedKey = (contactId: string) => ['contact-enriched', contactId] as const;
const conversationTabCountsKey = (contactId: string) => ['conversation-tab-counts', contactId] as const;

/**
 * Fila de atribuições por contato: dois toques rápidos (A, depois B) disparam dois
 * UPDATEs. Sem ordem, o banco pode gravar B antes de A e cada aceite invalida o
 * cache — a UI pisca fora da ordem dos cliques. A cadeia executa um de cada vez POR
 * CONTATO (o `Map` é do módulo, então instâncias diferentes do hook dividem a mesma
 * fila do mesmo contato; contato diferente tem fila própria e não espera). A ordem
 * do banco passa a ser a ordem dos cliques, e cada aceite continua invalidando e
 * avisando — resposta obsoleta nunca apaga o estado da mais nova, porque nenhuma
 * resposta é descartada. A entrada sai do `Map` ao assentar (sem vazar).
 */
const filasPorContato = new Map<string, Promise<void>>();

function encadearPorContato(contactId: string, trabalho: () => Promise<void>): Promise<void> {
  const anterior = filasPorContato.get(contactId) ?? Promise.resolve();
  const atual = anterior.then(trabalho, trabalho);
  const registrada = atual.then(
    () => undefined,
    () => undefined,
  );
  filasPorContato.set(contactId, registrada);
  void registrada.finally(() => {
    if (filasPorContato.get(contactId) === registrada) filasPorContato.delete(contactId);
  });
  return atual;
}

/**
 * Troca de responsável (atendente/fila) de um contato.
 *
 * O UPDATE direto em `contacts` sozinho não bastava: quem exibe o contato lê de caches
 * do React Query (lista/contadores da tela de Contatos, enriquecido e CRM 360 do painel,
 * contadores de aba da conversa) e continuava mostrando o responsável antigo até o
 * staleTime expirar. Aqui as quatro famílias são invalidadas depois do aceite do banco.
 *
 * Não há trilha de transferência neste caminho (histórico/nota) — isso é o CT-082, que
 * troca o UPDATE pela RPC transacional.
 */
export function useContactAssignment(contactId: string) {
  const queryClient = useQueryClient();

  const invalidarCachesDoContato = useCallback(() => {
    invalidateContactsAggregates(queryClient);
    void queryClient.invalidateQueries({ queryKey: contactEnrichedKey(contactId) });
    void queryClient.invalidateQueries({ queryKey: contactCrm360Key(contactId) });
    void queryClient.invalidateQueries({ queryKey: conversationTabCountsKey(contactId) });
  }, [queryClient, contactId]);

  const assignAgent = useCallback(async (agentId: string | null) => {
    await encadearPorContato(contactId, async () => {
      try {
        const { error } = await supabase
          .from('contacts')
          .update({ assigned_to: agentId })
          .eq('id', contactId);

        if (error) throw error;
        invalidarCachesDoContato();
        toast.success(agentId ? 'Atendente atribuído' : 'Atendente removido');
      } catch (err) {
        log.error('Error assigning agent:', err);
        toast.error('Erro ao atribuir atendente');
      }
    });
  }, [contactId, invalidarCachesDoContato]);

  const assignQueue = useCallback(async (queueId: string | null) => {
    await encadearPorContato(contactId, async () => {
      try {
        const { error } = await supabase
          .from('contacts')
          .update({ queue_id: queueId })
          .eq('id', contactId);

        if (error) throw error;
        invalidarCachesDoContato();
        toast.success(queueId ? 'Fila atribuída' : 'Fila removida');
      } catch (err) {
        log.error('Error assigning queue:', err);
        toast.error('Erro ao atribuir fila');
      }
    });
  }, [contactId, invalidarCachesDoContato]);

  return { assignAgent, assignQueue };
}
