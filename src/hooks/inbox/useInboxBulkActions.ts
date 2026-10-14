import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { undoToast } from '@/lib/undoToast';
import { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

interface UseInboxBulkActionsProps {
  refetch: () => void;
  filteredConversations: ConversationWithMessages[];
}

export function useInboxBulkActions({ refetch, filteredConversations }: UseInboxBulkActionsProps) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [fetchingAvatars, setFetchingAvatars] = useState(false);

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  const toggleSelection = useCallback((contactId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(contactId)) {
        newSet.delete(contactId);
      } else {
        newSet.add(contactId);
      }
      return newSet;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, []);

  const selectAll = useCallback(() => {
    if (!selectionMode) setSelectionMode(true);
    const allIds = new Set(filteredConversations.map(c => c.contact.id));
    setSelectedIds(allIds);
    toast.success(`${allIds.size} conversa(s) selecionada(s)`);
  }, [filteredConversations, selectionMode]);

  const bulkMarkAsRead = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const contactIds = Array.from(selectedIds);
      // Mesma regra da unitária (RealtimeService.markMessagesAsRead): só a
      // mensagem RECEBIDA (sender='contact') e ainda não lida. Sem o filtro de
      // sender o lote marcava como lida também a mensagem do operador.
      // `.select('contact_id')` devolve as linhas de fato alteradas: a contagem
      // anunciada é a real, não o número de contatos selecionados.
      const { data, error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .in('contact_id', contactIds)
        .eq('sender', 'contact')
        .eq('is_read', false)
        .select('contact_id');
      if (error) throw error;
      const markedContacts = new Set((data ?? []).map(row => row.contact_id));
      if (markedContacts.size === 0) {
        toast.info('Nenhuma mensagem não lida nesses contatos');
        return;
      }
      toast.success(`${markedContacts.size} conversa(s) marcada(s) como lida(s)`);
      clearSelection();
      refetch();
    } catch {
      toast.error('Erro ao marcar como lido');
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, clearSelection, refetch]);

  const bulkTransfer = useCallback(async (type: 'agent' | 'queue', targetId: string, message?: string) => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const contactIds = Array.from(selectedIds);
      const note = message?.trim() ? message.trim() : null;
      // Transferir é a RPC transfer_conversation (mesma do atendimento
      // individual): ela grava o assigned_to/queue_id E abre a trilha da
      // transferência. O UPDATE direto em contacts só trocava o dono — o
      // histórico da conversa não registrava nada. Conversa a conversa, para
      // contar sucesso e falha de cada uma.
      let ok = 0;
      let failed = 0;
      for (const contactId of contactIds) {
        const { error } = await supabase.rpc('transfer_conversation', {
          p_contact_id: contactId,
          p_to_agent_id: type === 'agent' ? targetId : null,
          p_to_queue_id: type === 'queue' ? targetId : null,
          p_note: note,
        });
        if (error) failed += 1;
        else ok += 1;
      }
      if (ok === 0) throw new Error('nenhuma transferência concluída');
      if (failed > 0) {
        toast.error(`${ok} contato(s) transferido(s); ${failed} falhou(aram)`);
      } else {
        toast.success(`${ok} contato(s) transferido(s)`);
      }
      clearSelection();
      refetch();
    } catch {
      toast.error('Erro ao transferir contatos');
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, clearSelection, refetch]);

  const bulkArchive = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const contactIds = Array.from(selectedIds);
      // Arquivamento em lote pela MESMA RPC do individual: muda o
      // conversation_status (o campo do chip "Arquivadas") e NÃO mexe em
      // assigned_to, então ninguém perde o responsável. Cada conversa é
      // confirmada pela RPC antes de entrar na contagem e no desfazer.
      const archived: string[] = [];
      for (const contactId of contactIds) {
        const { error } = await supabase.rpc('set_conversation_status', {
          p_contact_id: contactId,
          p_next: 'archived',
        });
        if (error) continue;
        archived.push(contactId);
        window.dispatchEvent(
          new CustomEvent('zapp:contact-status-changed', {
            detail: { contactId, status: 'archived' },
          })
        );
      }
      if (archived.length === 0) throw new Error('nenhuma conversa arquivada');
      undoToast({
        message:
          archived.length === contactIds.length
            ? `${archived.length} contato(s) arquivado(s)`
            : `${archived.length} de ${contactIds.length} contato(s) arquivado(s)`,
        icon: '📦',
        onUndo: async () => {
          // Reabre pela RPC os MESMOS contatos arquivados nesta chamada (o
          // alvo fica congelado: mexer na seleção não troca o que o Desfazer
          // reverte). Como o arquivamento não mexe em assigned_to, reabrir
          // basta — o responsável nunca saiu do lugar.
          for (const contactId of archived) {
            const { error } = await supabase.rpc('set_conversation_status', {
              p_contact_id: contactId,
              p_next: 'open',
            });
            if (error) throw error;
            window.dispatchEvent(
              new CustomEvent('zapp:contact-status-changed', {
                detail: { contactId, status: 'open' },
              })
            );
          }
          refetch();
        },
      });
      clearSelection();
      refetch();
    } catch {
      toast.error('Erro ao arquivar contatos');
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, clearSelection, refetch]);

  const handleBatchFetchAvatars = useCallback(async () => {
    setFetchingAvatars(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('batch-fetch-avatars');
      if (fnError) throw fnError;
      toast.success(`${data?.updated || 0} avatares atualizados de ${data?.processed || 0} contatos.`);
      refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error('Erro ao buscar avatares: ' + message);
    } finally {
      setFetchingAvatars(false);
    }
  }, [refetch]);

  return {
    selectionMode,
    selectedIds,
    bulkLoading,
    fetchingAvatars,
    toggleSelectionMode,
    toggleSelection,
    clearSelection,
    selectAll,
    bulkMarkAsRead,
    bulkTransfer,
    bulkArchive,
    handleBatchFetchAvatars,
  };
}
