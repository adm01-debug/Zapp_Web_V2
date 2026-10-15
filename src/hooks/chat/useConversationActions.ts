import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { undoToast } from '@/lib/undoToast';
import { snoozeDurationToDate } from '@/hooks/chat/snoozeDurations';
import { queryClient } from '@/lib/queryClient';
import { CHAVES_AFETADAS_POR_REATRIBUICAO } from '@/hooks/crm/useAgentReassignment';
import { conversationTabCountsKey } from '@/hooks/chat/useConversationTabCounts';

// Bus de sincronização de favoritos — múltiplas instâncias do hook ficam em sync
const _favBus = new EventTarget();
// Bus de sincronização de adiamentos — a lista (sidebar) e o painel do chat usam
// instâncias separadas do hook; o evento carrega o adiamento em si (contact_id +
// vencimento em epoch ms) em vez de disparar novo SELECT, que sobrescreveria o
// estado otimista com uma leitura defasada.
const _snoozeBus = new EventTarget();

interface SnoozeChange {
  contactId: string;
  until: number;
}

interface FavoriteContact {
  contact_id: string;
}

/** Erro devolvido pelo PostgREST: `code` traz o SQLSTATE, `message` o texto. */
type RpcError = { code?: string | null; message?: string | null } | null;

interface TransferArgs {
  p_contact_id: string;
  p_to_agent_id: string | null;
  p_to_queue_id: string | null;
  p_note: string | null;
  /** Só existe a partir do PK-03 (compare-and-set do dono). */
  p_expected_agent_id?: string | null;
}

/**
 * O tipo gerado em `types.ts` ainda não conhece `p_expected_agent_id` — quem o
 * adiciona é a migration do PK-03 e ela ainda não foi integrada neste workspace.
 * O cast sai quando o `types.ts` for regenerado do banco com a migration
 * aplicada (mesmo padrão de src/hooks/analytics/useAIUsageDashboard.ts).
 */
const transferRpc = supabase.rpc as unknown as (
  fn: 'transfer_conversation',
  args: TransferArgs,
) => PromiseLike<{ data: string | null; error: RpcError }>;

/**
 * Servidor antigo (sem o PK-03) recusa a assinatura nova com PGRST202 /
 * "Could not find the function": a chamada tolerante refaz sem o parâmetro em vez
 * de perder a transferência por causa da versão do banco.
 */
function assinaturaSemDonoEsperado(error: RpcError): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202') return true;
  return /could not find the function/i.test(error.message ?? '');
}

/**
 * Compare-and-set do PK-03: 40001 quando o dono do contato já mudou de mãos.
 * O código é o sinal estável (a mensagem 'Contato ja foi transferido por outro
 * atendente.' pode ser reescrita).
 */
function conflitoDeDono(error: RpcError): boolean {
  if (!error) return false;
  if (error.code === '40001') return true;
  return /j[áa] foi transferido/i.test(error.message ?? '');
}

/**
 * O dono mudou (ou pode ter mudado): invalida a lista e o painel do contato para
 * a tela não continuar mostrando o responsável antigo. Mesmas chaves REAIS da
 * reatribuição de agentes (src/hooks/crm/useAgentReassignment.ts), que é o outro
 * caminho que mexe em `contacts.assigned_to`, mais a chave por contato.
 */
function invalidarListaEContato(contactId: string) {
  void queryClient.invalidateQueries({ queryKey: ['contact-sidebar', contactId] });
  void queryClient.invalidateQueries({ queryKey: conversationTabCountsKey(contactId) });
  for (const queryKey of CHAVES_AFETADAS_POR_REATRIBUICAO) {
    void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }
}

export function useConversationActions() {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  // Adiamentos ativos por contato: contact_id → vencimento (epoch ms). Guardar o
  // vencimento (e não só o id) é o que permite retomar a conversa na hora devida.
  const [snoozes, setSnoozes] = useState<Map<string, number>>(new Map());
  // Marca temporal que avança no vencimento do próximo adiamento, forçando o
  // recálculo de `snoozedIds` — sem isso, `isSnoozed` ficaria "verdadeiro" para
  // sempre e a conversa nunca voltaria à lista.
  const [agora, setAgora] = useState(() => Date.now());
  const [profileId, setProfileId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !mountedRef.current) return;
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (data && mountedRef.current) setProfileId(data.id);
  }, []);

  const loadPinned = useCallback(async (pid: string) => {
    const { data } = await supabase
      .from('pinned_conversations')
      .select('contact_id')
      .eq('pinned_by', pid);
    if (data && mountedRef.current) setPinnedIds(new Set(data.map((p) => p.contact_id)));
  }, []);

  const loadFavorites = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !mountedRef.current) return;
    const { data } = await supabase
      .from('favorite_contacts')
      .select('contact_id')
      .eq('user_id', user.id);
    if (data && mountedRef.current) setFavoriteIds(new Set(data.map((f: FavoriteContact) => f.contact_id)));
  }, []);

  const loadSnoozed = useCallback(async (pid: string) => {
    const { data } = await supabase
      .from('conversation_snoozes')
      .select('contact_id, snooze_until')
      .eq('snoozed_by', pid)
      .gt('snooze_until', new Date().toISOString());
    if (data && mountedRef.current) {
      setSnoozes(new Map(data.map((s) => [s.contact_id, new Date(s.snooze_until).getTime()])));
      setAgora(Date.now());
    }
  }, []);

  useEffect(() => {
    loadProfile();
    loadFavorites();
    // Sincronizar com outras instâncias do hook (VRL ↔ ContactHeaderSection)
    const onFavChange = () => { if (mountedRef.current) loadFavorites(); };
    _favBus.addEventListener('change', onFavChange);
    return () => { _favBus.removeEventListener('change', onFavChange); };
  }, [loadProfile, loadFavorites]);

  useEffect(() => {
    if (profileId) {
      loadPinned(profileId);
      loadFavorites();
      loadSnoozed(profileId);
    }
  }, [profileId, loadPinned, loadFavorites, loadSnoozed]);

  // Sincroniza adiamentos entre instâncias (lista ↔ painel do chat): o evento já
  // traz o vencimento, então aplicamos localmente sem refazer o SELECT.
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<SnoozeChange>).detail;
      if (!detail || !mountedRef.current) return;
      setSnoozes((prev) => {
        const next = new Map(prev);
        next.set(detail.contactId, detail.until);
        return next;
      });
      setAgora(Date.now());
    };
    _snoozeBus.addEventListener('change', onChange);
    return () => { _snoozeBus.removeEventListener('change', onChange); };
  }, []);

  // Retomada: agenda um tick para o vencimento mais próximo; ao disparar, `agora`
  // avança e o adiamento vencido deixa de contar, fazendo a conversa voltar sozinha.
  useEffect(() => {
    const futuros = [...snoozes.values()].filter((until) => until > agora);
    if (futuros.length === 0) return;
    const proximo = Math.min(...futuros);
    const id = window.setTimeout(() => setAgora(Date.now()), Math.max(0, proximo - agora) + 1);
    return () => { window.clearTimeout(id); };
  }, [snoozes, agora]);

  const pinConversation = useCallback(async (contactId: string) => {
    if (!profileId) return;
    const { error } = await supabase
      .from('pinned_conversations')
      .insert({ contact_id: contactId, pinned_by: profileId, position: 0 });
    if (!error) {
      setPinnedIds(prev => new Set([...prev, contactId]));
      toast.success('Conversa fixada');
    }
  }, [profileId]);

  const unpinConversation = useCallback(async (contactId: string) => {
    if (!profileId) return;
    const { error } = await supabase
      .from('pinned_conversations')
      .delete()
      .eq('contact_id', contactId)
      .eq('pinned_by', profileId);
    if (!error) {
      setPinnedIds(prev => { const n = new Set(prev); n.delete(contactId); return n; });
      toast.success('Conversa desafixada');
    }
  }, [profileId]);

  const favoriteContact = useCallback(async (contactId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from('favorite_contacts')
      .insert({ contact_id: contactId, user_id: user.id });
    if (!error) {
      setFavoriteIds(prev => new Set([...prev, contactId]));
      _favBus.dispatchEvent(new CustomEvent('change'));
      toast.success('Contato favoritado');
    }
  }, []);

  const unfavoriteContact = useCallback(async (contactId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from('favorite_contacts')
      .delete()
      .eq('contact_id', contactId)
      .eq('user_id', user.id);
    if (!error) {
      setFavoriteIds(prev => { const n = new Set(prev); n.delete(contactId); return n; });
      _favBus.dispatchEvent(new CustomEvent('change'));
      toast.success('Favorito removido');
    }
  }, []);

  const snoozeConversation = useCallback(async (contactId: string, duration: string) => {
    if (!profileId) return;
    // A regra de "próxima semana" (e de amanhã às 9h) mora em snoozeDurations,
    // compartilhada com quem mais adia — uma versão só do cálculo.
    const snoozeUntil = snoozeDurationToDate(duration);

    // Gravação que PRESERVA o adiamento anterior em caso de falha: a nova linha
    // é inserida ANTES de a antiga ser removida. Antes o delete vinha primeiro e
    // uma inserção recusada (RLS/rede) apagava o adiamento que já existia — a
    // conversa sumia do adiamento por causa de uma gravação que falhou.
    const { data: anteriores, error: selectError } = await supabase
      .from('conversation_snoozes')
      .select('id')
      .eq('contact_id', contactId)
      .eq('snoozed_by', profileId);
    if (selectError) {
      toast.error('Erro ao adiar conversa. Tente novamente.');
      return;
    }
    // Sem índice único, o par (contact_id, snoozed_by) pode ter várias linhas:
    // é preciso remover TODAS, como o delete original fazia.
    const idsAnteriores = (anteriores ?? []).map((linha) => linha.id);

    // O `.select('id')` devolve o id da linha nova para a reversão explícita
    // abaixo (se a remoção das antigas falhar, a nova é apagada de volta).
    const { data: inserido, error } = await supabase
      .from('conversation_snoozes')
      .insert({
        contact_id: contactId,
        snoozed_by: profileId,
        snooze_until: snoozeUntil.toISOString(),
      })
      .select('id')
      .single();
    if (error) {
      // Falha visível e adiamento anterior intacto (as linhas antigas só são
      // removidas abaixo, depois do aceite).
      toast.error('Erro ao adiar conversa. Tente novamente.');
      return;
    }

    if (idsAnteriores.length > 0) {
      const { error: deleteError } = await supabase
        .from('conversation_snoozes')
        .delete()
        .in('id', idsAnteriores);
      if (deleteError) {
        // Sem a remoção, sobrariam duas linhas e a antiga (com vencimento
        // mais tarde) poderia manter a conversa adiada além do novo prazo:
        // reverte a linha nova em vez de sinalizar sucesso inconsistente.
        if (inserido?.id) {
          await supabase.from('conversation_snoozes').delete().eq('id', inserido.id);
        }
        toast.error('Erro ao adiar conversa. Tente novamente.');
        return;
      }
    }

    const until = snoozeUntil.getTime();
    setSnoozes((prev) => {
      const next = new Map(prev);
      next.set(contactId, until);
      return next;
    });
    setAgora(Date.now());
    _snoozeBus.dispatchEvent(new CustomEvent<SnoozeChange>('change', { detail: { contactId, until } }));
    toast.success('Conversa adiada');
  }, [profileId]);

  const archiveContact = useCallback(async (contactId: string) => {
    const { data: original } = await supabase.from('contacts').select('assigned_to').eq('id', contactId).single();
    const { error } = await supabase.from('contacts').update({ assigned_to: null }).eq('id', contactId);
    if (error) { toast.error('Erro ao arquivar conversa'); return; }
    undoToast({
      message: 'Conversa arquivada',
      icon: '📦',
      onUndo: async () => {
        await supabase.from('contacts').update({ assigned_to: original?.assigned_to ?? null }).eq('id', contactId);
      },
    });
  }, []);

  /**
   * Transfere a conversa. `expectedAgentId` é o `assigned_to` que a tela conhece
   * quando o diálogo abre: a RPC do PK-03 compara com o dono atual e recusa se
   * outro atendente transferiu no meio do caminho. `undefined` = servidor antigo /
   * chamador que não passa o dono (aí a RPC roda sem o compare-and-set).
   */
  const transferContact = useCallback(async (
    contactId: string,
    type: 'agent' | 'queue' | 'connection',
    targetId: string,
    note?: string,
    expectedAgentId?: string | null,
  ) => {
    if (type === 'connection') {
      toast.error('Transferência por conexão ainda não é suportada');
      return;
    }

    const trimmedNote = note?.trim();
    const args: TransferArgs = {
      p_contact_id: contactId,
      p_to_agent_id: type === 'agent' ? targetId : null,
      p_to_queue_id: type === 'queue' ? targetId : null,
      p_note: trimmedNote || null,
    };

    let { error } = expectedAgentId === undefined
      ? await transferRpc('transfer_conversation', args)
      : await transferRpc('transfer_conversation', { ...args, p_expected_agent_id: expectedAgentId });

    // Chamada tolerante: o banco da tarefa pode ainda não ter a migration do
    // PK-03. Sem o parâmetro a transferência segue como antes (sem o CAS).
    if (error && expectedAgentId !== undefined && assinaturaSemDonoEsperado(error)) {
      ({ error } = await transferRpc('transfer_conversation', args));
    }

    if (error) {
      // Conflito de dono: não é falha de rede nem permissão — a conversa só saiu
      // de mãos. Avisa e devolve a lista atualizada; rejeitar só manteria aberto um
      // diálogo cujo alvo já não faz sentido (e quem chamou não refaria o refetch).
      if (conflitoDeDono(error)) {
        toast.error('Esta conversa mudou de responsável. Atualizamos a lista.');
        invalidarListaEContato(contactId);
        return;
      }
      // Rejeita (não só toast): quem chamou precisa saber que falhou — a sidebar
      // usa a rejeição pra manter o diálogo/alvo abertos. A RPC é transacional:
      // erro nela significa que nem UPDATE em contacts nem evento foram persistidos.
      toast.error('Erro ao transferir conversa');
      throw error;
    }
    toast.success(type === 'agent' ? 'Chat transferido para outro atendente' : 'Chat transferido para outra fila');
  }, []);

  // Só conta como adiada a conversa cujo prazo ainda não venceu — ao passar o
  // vencimento (tick acima), some do conjunto e a conversa volta à lista.
  const snoozedIds = useMemo(
    () => new Set([...snoozes.entries()].filter(([, until]) => until > agora).map(([id]) => id)),
    [snoozes, agora],
  );

  const isPinned = useCallback((contactId: string) => pinnedIds.has(contactId), [pinnedIds]);
  const isFavorite = useCallback((contactId: string) => favoriteIds.has(contactId), [favoriteIds]);
  const isSnoozed = useCallback((contactId: string) => snoozedIds.has(contactId), [snoozedIds]);

  return {
    pinnedIds,
    favoriteIds,
    snoozedIds,
    isPinned,
    isFavorite,
    isSnoozed,
    pinConversation,
    unpinConversation,
    favoriteContact,
    unfavoriteContact,
    snoozeConversation,
    archiveContact,
    transferContact,
    profileId,
  };
}
