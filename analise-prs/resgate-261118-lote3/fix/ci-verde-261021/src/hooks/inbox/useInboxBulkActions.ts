import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUndoableAction } from '@/hooks/system/useUndoableAction';
import { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
// `contacts.id`/`messages.contact_id` são uuid: id que não é uuid (link direto,
// JID) faria o PostgREST responder 400 e o lote inteiro falharia. Mesma guarda
// usada em `useCalls` — uma fonte só para o formato de uuid.
import { isValidUUID } from '@/hooks/communication/useCalls';

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

  // Fronteira da seleção: os ids que o operador VÊ agora. O lote só pode agir
  // sobre conversa visível, então `selectedIds` é podado por interseção sempre
  // que esta lista muda (troca de chip/fila/tipo/busca).
  const visibleIds = useMemo(
    () => new Set(filteredConversations.map(c => c.contact.id)),
    [filteredConversations],
  );
  // Lista observada na renderização anterior; `null` na primeira vez. Na
  // montagem (ou no carregamento, com lista vazia) não há filtro a comparar, e a
  // seleção já nasce vazia — então nada é podado.
  const prevVisibleIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const previous = prevVisibleIdsRef.current;
    prevVisibleIdsRef.current = visibleIds;
    if (previous === null) return; // primeira lista: nada a comparar
    setSelectedIds(prev => {
      if (prev.size === 0) return prev;
      let mudou = false;
      const next = new Set<string>();
      prev.forEach(id => {
        if (visibleIds.has(id)) next.add(id);
        else mudou = true;
      });
      // Mesmo Set quando nada saiu: evita re-render quando o pai troca a
      // identidade do array a cada render.
      return mudou ? next : prev;
    });
  }, [visibleIds]);

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
    // Só o que está FILTRADO (visível): nunca contatos escondidos pelo filtro.
    const allIds = new Set(filteredConversations.map(c => c.contact.id));
    setSelectedIds(allIds);
    toast.success(`${allIds.size} conversa(s) selecionada(s)`);
  }, [filteredConversations, selectionMode]);

  const bulkMarkAsRead = useCallback(async () => {
    if (selectedIds.size === 0) return;
    // Id que não é uuid nunca chega ao banco (400 do PostgREST derrubaria o lote
    // inteiro). Sobrando zero id válido, não há o que gravar: avisa e sai.
    const contactIds = Array.from(selectedIds).filter(isValidUUID);
    if (contactIds.length === 0) {
      toast.info('Nenhuma conversa válida na seleção');
      return;
    }
    setBulkLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .in('contact_id', contactIds)
        // Só mensagens RECEBIDAS do contato: sem este filtro o lote também
        // zerava o `is_read` das mensagens enviadas pelo agente.
        .eq('sender', 'contact')
        .eq('is_read', false)
        // O retorno é o que PROVA quantas conversas mudaram de estado: o toast
        // antigo contava a seleção, não o efeito no banco (sucesso falso).
        .select('contact_id');
      if (error) throw error;
      const contatosAfetados = new Set<string>();
      for (const linha of data ?? []) {
        if (linha.contact_id) contatosAfetados.add(linha.contact_id);
      }
      const marcadas = contatosAfetados.size;
      // 0 linhas é aviso neutro, não sucesso: nada foi marcado (RLS filtrando ou
      // nenhuma não lida entre os selecionados).
      if (marcadas === 0) {
        toast.info('Nenhuma mensagem não lida nessas conversas');
      } else {
        toast.success(`${marcadas} conversa(s) marcada(s) como lida(s)`);
      }
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
          p_to_agent_id: type === 'agent' ? targetId : undefined,
          p_to_queue_id: type === 'queue' ? targetId : undefined,
          p_note: undefined,
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
