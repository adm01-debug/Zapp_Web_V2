import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUndoableAction } from '@/hooks/system/useUndoableAction';
import { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
// `contacts.id`/`messages.contact_id` são uuid: id que não é uuid (link direto,
// JID) faria o PostgREST responder 400 e o lote inteiro falharia. Mesma guarda
// usada em `useCalls` — uma fonte só para o formato de uuid.
import { isValidUUID } from '@/hooks/communication/useCalls';
import { canArchiveConversation, moveConversationsStatus, movedBeforeError, type ConversationStatus } from '@/hooks/inbox/conversationArchive';
import { transferConversation, transferErrorMessage } from '@/lib/inbox/transferConversation';

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
    // Dono visto na lista, por contato: vai como p_expected_agent_id (compare-and-set).
    const donoVisto = new Map(filteredConversations.map((c) => [c.contact.id, c.contact.assigned_to ?? null]));
    const failures: unknown[] = [];
    let transferidos = 0;

    try {
      // Uma RPC por contato, em série: `transfer_conversation` é atômica POR
      // CONVERSA (UPDATE em contacts + INSERT do evento na mesma transação).
      // Chamadas concorrentes sobre o mesmo lote só gerariam corrida de erro.
      for (const contactId of contactIds) {
        const { error } = await transferConversation({
          contactId,
          toAgentId: type === 'agent' ? targetId : undefined,
          toQueueId: type === 'queue' ? targetId : undefined,
          // null = sem dono na lista; fora da lista = sem compare-and-set.
          expectedAgentId: donoVisto.has(contactId) ? donoVisto.get(contactId) ?? null : undefined,
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
      const conflitos = failures.filter((f) => (f as { code?: unknown })?.code === '40001').length;
      toast.error(
        `Erro ao transferir contatos: ${transferidos} de ${contactIds.length} contato(s) transferido(s); ${failures.length} falharam`
          + (conflitos > 0 ? ` (${conflitos} já tinham sido transferido(s) ou assumido(s) por outro atendente — atualize a lista)` : ''),
      );
      throw failures[0];
    }

    toast.success(`${contactIds.length} contato(s) transferido(s)`);
    clearSelection();
    refetch();
  }, [selectedIds, clearSelection, refetch, filteredConversations]);

  const bulkArchive = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    const contactIds = Array.from(selectedIds);

    try {
      // Retrato do estado ANTERIOR: o desfazer devolve cada contato ao
      // `conversation_status` original. A leitura pode ser barrada pelo RLS —
      // erro aqui aborta sem arquivar nada.
      const { data: originals, error: selectError } = await supabase
        .from('contacts')
        .select('id, conversation_status')
        .in('id', contactIds);
      if (selectError) { toast.error('Não foi possível verificar o estado das conversas'); return; }

      const previousStatus = new Map<string, string | null>();
      for (const row of originals ?? []) {
        previousStatus.set(row.id, row.conversation_status ?? null);
      }
      // Só arquiva quem foi LIDO e não está already archived. Zero linha lida
      // (RLS filtrando) não é sucesso — sem alvo, avisa em vez de arquivar às cegas.
      // Contato já 'archived' é excluído: arquivar não muda seu estado, mas o
      // desfazer mapearia 'archived' → 'open' (fora de validFromArchived), abrindo
      // uma conversa que estava arquivada antes da ação do operador.
      const targetIds = contactIds.filter(
        (id) => previousStatus.has(id) && canArchiveConversation(previousStatus.get(id)),
      );
      // Decisão do dono (2026-11-13): conversa 'waiting' não é arquivada — o lote
      // pula e diz quantas ficaram de fora.
      const aguardando = contactIds.filter((id) => previousStatus.get(id) === 'waiting').length;
      if (aguardando > 0) {
        toast.info(`${aguardando} conversa(s) aguardando atendimento não foram arquivadas — atenda ou encerre antes.`);
      }
      if (targetIds.length === 0) { toast.info('Nenhum contato disponível para arquivar'); return; }

      // Quantas o BANCO arquivou de fato (resultado da RPC), não quantas foram pedidas.
      await executeUndoable({
        successMessage: (arquivadas: number) => `${arquivadas} contato(s) arquivado(s)`,
        undoMessage: 'Arquivamento desfeito',
        action: async () => {
          // P1-2: pela RPC de lote (UPDATE direto em conversation_status é recusado no banco).
          let movidas: Map<string, ConversationStatus>;
          try {
            movidas = await moveConversationsStatus(targetIds, 'archived');
          } catch (err) {
            // Lote acima de 500 vai em pedaços: se um pedaço falha, os anteriores JÁ foram
            // arquivados — mantém o desfazer e recarrega a lista em vez de só dar erro.
            const parcial = movedBeforeError(err);
            if (!parcial?.size) throw err;
            movidas = parcial;
            toast.warning(`${parcial.size} de ${targetIds.length} arquivados — o restante falhou. Tente de novo.`);
          }
          const arquivadas = movidas.size;
          if (arquivadas === 0) throw new Error('Nenhuma conversa foi arquivada');
          clearSelection();
          refetch();
          return arquivadas;
        },
        undoAction: async () => {
          // Trigger enforce_conversation_status_transition: de 'archived' só é
          // válido 'open' em um único passo. 'resolved' volta pela RPC em modo
          // restore (archived→open→resolved no banco, SEM novo encerramento — pela
          // RPC comum o 2º passo gravaria outro encerramento e o banco recusaria com
          // 23505). Para restaurar waiting (legado), dois passos: archived→open→original.
          //
          // Cada UPDATE só atinge quem AINDA está no estado esperado
          // (`conversation_status='archived'` no 1º passo, `'open'` no 2º) e devolve os
          // ids atingidos: uma conversa reaberta por mensagem nova durante a janela do
          // desfazer não é forçada de volta a resolved/waiting. Um grupo que falha não
          // impede os outros; o resultado é contado por conversa.
          const validFromArchived = new Set(['open', 'resolved']);
          const directGroups = new Map<string, string[]>();
          const twoStepGroups = new Map<string, string[]>();

          for (const id of targetIds) {
            // 'pending'/'closed' são legados (fora de regras.md §4.1): a FSM não deixa
            // ninguém ENTRAR neles, então o desfazer devolve essas conversas a 'open'.
            const lido = previousStatus.get(id) ?? 'open';
            const original = lido === 'pending' || lido === 'closed' ? 'open' : lido;
            const groups = validFromArchived.has(original) ? directGroups : twoStepGroups;
            const g = groups.get(original) ?? [];
            g.push(id);
            groups.set(original, g);
          }

          const restored = new Set<string>();
          let failed = false;

          const moveTo = async (status: string, ids: string[], from: string): Promise<string[]> => {
            try {
              const restore = status === 'resolved' && from === 'archived';
              const moved = await moveConversationsStatus(ids, status as ConversationStatus, from as ConversationStatus, restore);
              return [...moved.keys()];
            } catch {
              failed = true;
              return [];
            }
          };

          try {
            for (const [status, ids] of directGroups) {
              for (const id of await moveTo(status, ids, 'archived')) restored.add(id);
            }

            if (twoStepGroups.size > 0) {
              // Passo 1: archived → open (sempre válido), só para quem segue arquivado.
              const opened = new Set(await moveTo('open', [...twoStepGroups.values()].flat(), 'archived'));
              // Passo 2: open → status original, só nos ids que o passo 1 devolveu.
              for (const [original, ids] of twoStepGroups) {
                const reached = ids.filter((id) => opened.has(id));
                if (reached.length === 0) continue;
                for (const id of await moveTo(original, reached, 'open')) restored.add(id);
              }
            }
          } finally {
            refetch();
          }

          const total = targetIds.length;
          if (failed) {
            toast.warning(`${restored.size} de ${total} restaurados`);
            throw new Error('desfazer parcial');
          }
          if (restored.size < total) {
            // Sem erro: as que faltam já tinham saído do arquivo (ex.: mensagem nova).
            toast.info(`${restored.size} de ${total} restaurados — as demais já tinham sido reabertas`);
          }
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
