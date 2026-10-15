import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUndoableAction } from '@/hooks/system/useUndoableAction';
import { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

interface UseInboxBulkActionsProps {
  refetch: () => void;
  filteredConversations: ConversationWithMessages[];
}

// Falha de UMA linha do lote de transferência: id do contato + motivo do
// banco (só mensagem sistêmica, sem PII).
interface TransferFailure {
  contactId: string;
  reason: string;
}

const rotuloFalha = (n: number) => (n === 1 ? 'falhou' : 'falharam');

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
      // O `.select('id')` devolve as linhas que o banco REALMENTE atualizou:
      // sem ele o toast contaria a seleção mesmo quando o RLS barrou tudo.
      const { data, error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .in('contact_id', contactIds)
        // Só mensagens RECEBIDAS do contato: sem este filtro o lote também
        // zerava o `is_read` das mensagens enviadas pelo agente.
        .eq('sender', 'contact')
        .eq('is_read', false)
        .select('id');
      if (error) throw error;
      const marcadas = data?.length ?? 0;
      if (marcadas === 0) {
        toast.info('Nenhuma mensagem nova para marcar como lida');
        return;
      }
      toast.success(`${marcadas} conversa(s) marcada(s) como lida(s)`);
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
    const contactIds = Array.from(selectedIds);
    // A nota do diálogo vai para a RPC (aparada); vazia ou ausente vira nulo
    // — nunca `undefined`, que sumiria do JSON da chamada.
    const note = message?.trim() ? message.trim() : null;
    const failures: TransferFailure[] = [];
    const transferidos: string[] = [];

    // Sincroniza o que JÁ entrou: tira da seleção só os transferidos e
    // recarrega a lista. Os que falharam continuam marcados para retry.
    const sincronizarParcial = () => {
      const ok = new Set(transferidos);
      setSelectedIds(prev => new Set([...prev].filter(id => !ok.has(id))));
      refetch();
    };

    const resumoTransferencia = () =>
      `Erro ao transferir contatos: ${transferidos.length} de ${contactIds.length} contato(s) transferido(s); ${failures.length} ${rotuloFalha(failures.length)}: ${failures.map(f => f.contactId).join(', ')}`;

    try {
      // Uma RPC por contato, em série: `transfer_conversation` é atômica POR
      // CONVERSA (UPDATE em contacts + INSERT do evento na mesma transação).
      // Chamadas concorrentes sobre o mesmo lote só gerariam corrida de erro.
      for (const contactId of contactIds) {
        const { error } = await supabase.rpc('transfer_conversation', {
          p_contact_id: contactId,
          p_to_agent_id: type === 'agent' ? targetId : null,
          p_to_queue_id: type === 'queue' ? targetId : null,
          p_note: note,
        });
        if (error) {
          const reason =
            error instanceof Error
              ? error.message
              : String(
                  (error as { message?: unknown }).message ?? 'erro desconhecido',
                );
          failures.push({ contactId, reason });
        } else transferidos.push(contactId);
      }
    } catch (err) {
      // Rejeição inesperada (rede): o que já transferiu fica valendo, então
      // recarrega quando houve sucesso antes da queda. O toast genérico e a
      // propagação continuam iguais.
      if (transferidos.length > 0) sincronizarParcial();
      toast.error('Erro ao transferir contatos');
      throw err;
    } finally {
      setBulkLoading(false);
    }

    // Sucesso parcial (ou total negativo): avisa com o resumo por linha,
    // sincroniza o que já entrou e rejeita com o resumo — quem chamou precisa
    // saber que falhou (a sidebar usa a rejeição para manter o diálogo/alvo
    // abertos). Nada de `failures[0]`: só a primeira falha não conta a história.
    if (failures.length > 0) {
      if (transferidos.length > 0) sincronizarParcial();
      const resumo = resumoTransferencia();
      toast.error(resumo);
      const erro = new Error(resumo) as Error & {
        failedContactIds: string[];
        transferFailures: TransferFailure[];
      };
      erro.failedContactIds = failures.map(f => f.contactId);
      erro.transferFailures = failures;
      throw erro;
    }

    toast.success(`${transferidos.length} contato(s) transferido(s)`);
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
