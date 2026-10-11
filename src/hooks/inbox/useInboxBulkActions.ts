import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUndoableAction } from '@/hooks/system/useUndoableAction';
import { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

interface UseInboxBulkActionsProps {
  refetch: () => void;
  filteredConversations: ConversationWithMessages[];
}

/** Quantas RPCs de arquivamento ficam em voo ao mesmo tempo (evita disparar todas de uma vez). */
const BULK_ARCHIVE_CONCURRENCY = 5;

/**
 * Roda `fn` sobre os ids com no máximo `limite` chamadas em voo e devolve os ids que
 * FALHARAM. Uma falha isolada não aborta o restante do lote.
 */
async function executarComConcorrencia(
  ids: string[],
  limite: number,
  fn: (id: string) => Promise<void>,
): Promise<string[]> {
  const falhas: string[] = [];
  let proximo = 0;
  const trabalhadores = Array.from({ length: Math.min(limite, ids.length) }, async () => {
    while (proximo < ids.length) {
      const id = ids[proximo++];
      try {
        await fn(id);
      } catch {
        falhas.push(id);
      }
    }
  });
  await Promise.all(trabalhadores);
  return falhas;
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
    // ADR-005: cada contato transiciona pela RPC set_conversation_status (valida papel e
    // transição), com no máximo BULK_ARCHIVE_CONCURRENCY em voo. Arquivar NÃO toca
    // assigned_to. O desfazer reabre só as que foram arquivadas de verdade.
    const arquivadas: string[] = [];

    try {
      const falhas = await executarComConcorrencia(contactIds, BULK_ARCHIVE_CONCURRENCY, async (id) => {
        const { error } = await supabase.rpc('set_conversation_status', {
          p_contact_id: id,
          p_next: 'archived',
          p_reason: 'arquivada_em_massa',
        });
        if (error) throw error;
        arquivadas.push(id);
      });

      if (falhas.length === 0) {
        clearSelection();
      } else {
        // Só quem falhou continua selecionado, para nova tentativa.
        setSelectedIds(new Set(falhas));
        toast.error(`${arquivadas.length} arquivadas, ${falhas.length} falharam`);
      }
      // Nada arquivado (falha total) = nada mudou na lista.
      if (arquivadas.length > 0) refetch();

      if (arquivadas.length > 0) {
        // A gravação já aconteceu acima (com falha parcial isolada): aqui o
        // executeUndoable só abre a janela de Desfazer — o aviso encerra o anterior e o
        // undo reabre exatamente as que foram arquivadas.
        await executeUndoable({
          successMessage: `${arquivadas.length} contato(s) arquivado(s)`,
          undoMessage: 'Arquivamento desfeito',
          action: async () => {},
          undoAction: async () => {
            const ids = [...arquivadas];
            await executarComConcorrencia(ids, BULK_ARCHIVE_CONCURRENCY, async (id) => {
              const { error } = await supabase.rpc('set_conversation_status', {
                p_contact_id: id,
                p_next: 'open',
                p_reason: 'desfazer_arquivamento_em_massa',
              });
              if (error) throw error;
            });
            refetch();
          },
          onCommit: () => {},
        });
      }
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
