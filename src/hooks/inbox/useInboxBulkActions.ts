import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUndoableAction } from '@/hooks/system/useUndoableAction';
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
  const { execute: executeUndoable } = useUndoableAction();

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
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .in('contact_id', contactIds)
        // Só mensagens RECEBIDAS do contato: sem este filtro o lote também
        // zerava o `is_read` das mensagens enviadas pelo agente.
        .eq('sender', 'contact')
        .eq('is_read', false);
      if (error) throw error;
      toast.success(`${contactIds.length} conversa(s) marcada(s) como lida(s)`);
      clearSelection();
      refetch();
    } catch {
      toast.error('Erro ao marcar como lido');
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, clearSelection, refetch]);

  const bulkTransfer = useCallback(async (type: 'agent' | 'queue', targetId: string, _message?: string) => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    const contactIds = Array.from(selectedIds);
    const failures: unknown[] = [];
    let transferidos = 0;

    try {
      // Uma RPC por contato, em série: `transfer_conversation` é atômica POR
      // CONVERSA (UPDATE em contacts + INSERT do evento na mesma transação).
      // Chamadas concorrentes sobre o mesmo lote só gerariam corrida de erro.
      for (const contactId of contactIds) {
        const { error } = await supabase.rpc('transfer_conversation', {
          p_contact_id: contactId,
          p_to_agent_id: type === 'agent' ? targetId : null,
          p_to_queue_id: type === 'queue' ? targetId : null,
          p_note: null,
        });
        if (error) failures.push(error);
        else transferidos += 1;
      }
    } catch (err) {
      // Rejeição inesperada (rede): o laço acima só devolve `error`, então isto
      // cobre a exceção crua e preserva o toast de erro.
      toast.error('Erro ao transferir contatos');
      throw err;
    } finally {
      setBulkLoading(false);
    }

    // Sucesso parcial (ou total negativo): avisa quantos foram e mantém a
    // seleção — quem chamou precisa saber que falhou (a sidebar usa a rejeição
    // para manter o diálogo/alvo abertos).
    if (failures.length > 0) {
      toast.error(
        `Erro ao transferir contatos: ${transferidos} de ${contactIds.length} contato(s) transferido(s); ${failures.length} falharam`,
      );
      throw failures[0];
    }

    toast.success(`${contactIds.length} contato(s) transferido(s)`);
    clearSelection();
    refetch();
  }, [selectedIds, clearSelection, refetch]);

  const bulkArchive = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    const contactIds = Array.from(selectedIds);

    const { data: originalContacts } = await supabase
      .from('contacts')
      .select('id, assigned_to')
      .in('id', contactIds);

    try {
      await executeUndoable({
        successMessage: `${contactIds.length} contato(s) arquivado(s)`,
        undoMessage: 'Arquivamento desfeito',
        action: async () => {
          const { error } = await supabase
            .from('contacts')
            .update({ assigned_to: null })
            .in('id', contactIds);
          if (error) throw error;
          clearSelection();
          refetch();
        },
        undoAction: async () => {
          if (originalContacts) {
            for (const contact of originalContacts) {
              await supabase
                .from('contacts')
                .update({ assigned_to: contact.assigned_to })
                .eq('id', contact.id);
            }
          }
          refetch();
        },
        onCommit: () => {},
      });
    } catch {
      toast.error('Erro ao arquivar contatos');
    } finally {
      setBulkLoading(false);
    }
  }, [selectedIds, clearSelection, refetch, executeUndoable]);

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
