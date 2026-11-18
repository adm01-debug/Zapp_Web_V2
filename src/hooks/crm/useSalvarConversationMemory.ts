/**
 * useSalvarConversationMemory — escrita da memória da conversa.
 *
 * Resgate de `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c`
 * (`ConversationMemoryPanel.tsx`): a `main` tinha só a metade de LEITURA, e
 * nenhum código do produto escrevia em `conversation_memory` — o atendente via
 * o que o app lembra do contato e não conseguia corrigir um fato, registrar uma
 * promessa ou fechar uma pendência.
 *
 * A produção já estava provisionada para isto: as políticas
 * `Agents can insert memory for their contacts` (INSERT) e
 * `Agents can update memory for their contacts` (UPDATE) existem para
 * `authenticated`, as duas restritas a `is_contact_visible_to_user(contact_id,
 * auth.uid())`. Nenhum DDL foi necessário.
 *
 * As duas guardas de escrita vêm do painel original e são o motivo deste hook
 * existir separado:
 *
 *  1. o UPDATE filtra por `id` E por `contact_id`. Só por `id`, uma linha lida
 *     de outro contato (resposta atrasada ao trocar de conversa) seria o alvo;
 *  2. sem `rowId` próprio, grava INSERT em vez de UPDATE. `useConversationMemory`
 *     só devolve `rowId` quando o `contact_id` da linha é o contato atual, então
 *     "não sei de quem é a linha" nunca vira UPDATE em contato alheio.
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import type { ConversationMemoryData } from '@/hooks/crm/useConversationMemory';

export type EstadoSalvamento = 'parado' | 'salvando' | 'erro';

/** Campos editáveis — `updatedAt` é do banco e não vem da tela. */
export type MemoriaEditavel = Omit<ConversationMemoryData, 'updatedAt'>;

function paraBanco(contactId: string, dados: MemoriaEditavel, autor: string | null) {
  return {
    contact_id: contactId,
    facts: dados.facts,
    objections_handled: dados.objectionsHandled,
    promises_made: dados.promisesMade,
    pending_items: dados.pendingItems,
    commercial_summary: dados.commercialSummary,
    cumulative_summary: dados.cumulativeSummary,
    updated_by: autor,
    updated_at: new Date().toISOString(),
  };
}

export function useSalvarConversationMemory() {
  const [estado, setEstado] = useState<EstadoSalvamento>('parado');

  const salvar = useCallback(
    async (contactId: string, rowId: string | null, dados: MemoriaEditavel): Promise<boolean> => {
      if (!contactId) return false;
      setEstado('salvando');

      // Autor da edição. `updated_by` é opcional na tabela, então falha ao
      // resolver o usuário não impede o registro do conteúdo.
      let autor: string | null = null;
      try {
        const { data } = await supabase.auth.getUser();
        autor = data?.user?.id ?? null;
      } catch (e) {
        log.error('Nao foi possivel identificar o autor da edicao da memoria:', e);
      }

      const payload = paraBanco(contactId, dados, autor);

      const { error } = rowId
        ? await supabase
            .from('conversation_memory')
            .update(payload)
            .eq('id', rowId)
            .eq('contact_id', contactId)
        : await supabase.from('conversation_memory').insert(payload);

      if (error) {
        log.error('Error saving conversation memory:', error);
        setEstado('erro');
        return false;
      }

      setEstado('parado');
      return true;
    },
    [],
  );

  return { salvar, salvando: estado === 'salvando', erroAoSalvar: estado === 'erro' };
}
