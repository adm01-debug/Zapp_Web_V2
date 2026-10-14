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
    try {
      const contactIds = Array.from(selectedIds);
      const updateData: { assigned_to?: string; queue_id?: string } = {};
      if (type === 'agent') {
        updateData.assigned_to = targetId;
      } else {
        updateData.queue_id = targetId;
      }
      const { error } = await supabase
        .from('contacts')
        .update(updateData)
        .in('id', contactIds);
      if (error) throw error;
      toast.success(`${contactIds.length} contato(s) transferido(s)`);
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
    const contactIds = Array.from(selectedIds);

    try {
      // Retrato do estado ANTERIOR: o desfazer devolve cada conversa ao
      // `conversation_status` que ela tinha (não a um valor fixo). A leitura
      // pode ser barrada pelo RLS — erro aqui aborta sem arquivar nada.
      const { data: originals, error: selectError } = await supabase
        .from('contacts')
        .select('id, conversation_status')
        .in('id', contactIds);
      if (selectError) throw selectError;

      const previousStatus = new Map<string, string>();
      for (const row of originals ?? []) {
        previousStatus.set(row.id, row.conversation_status);
      }
      // Só arquiva quem foi LIDO: sem o status anterior o desfazer não teria como
      // devolver a conversa ao estado dela. Zero linha lida (RLS filtrando) não é
      // sucesso — sem alvo, avisa em vez de arquivar às cegas.
      const targetIds = contactIds.filter((id) => previousStatus.has(id));
      if (targetIds.length === 0) throw new Error('nenhum contato lido');

      await executeUndoable({
        successMessage: `${targetIds.length} contato(s) arquivado(s)`,
        undoMessage: 'Arquivamento desfeito',
        action: async () => {
          // Arquivar = gravar o estado `archived` (mesmo valor e caminho do
          // `useBulkActions.ts`); `assigned_to` NÃO é tocado, então ninguém
          // perde o responsável.
          const { error } = await supabase
            .from('contacts')
            .update({ conversation_status: 'archived', updated_at: new Date().toISOString() })
            .in('id', targetIds);
          if (error) throw error;
          clearSelection();
          refetch();
        },
        undoAction: async () => {
          // Agrupado por valor anterior: um update por status distinto, não um
          // laço de um update por contato.
          const groups = new Map<string, string[]>();
          for (const id of targetIds) {
            const status = previousStatus.get(id);
            if (status === undefined) continue;
            const ids = groups.get(status) ?? [];
            ids.push(id);
            groups.set(status, ids);
          }
          for (const [status, ids] of groups) {
            const { error } = await supabase
              .from('contacts')
              .update({ conversation_status: status, updated_at: new Date().toISOString() })
              .in('id', ids);
            if (error) throw error;
          }
          refetch();
        },
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
