import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { undoToast } from '@/lib/undoToast';
import { snoozeDurationToDate } from '@/hooks/chat/snoozeDurations';

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
   * Reabre conversa RESOLVIDA/ARQUIVADA pela RPC `reopen_conversation`
   * (migration 20261013210003) — a MESMA que o gatilho usa quando o contato
   * escreve, então o estado e o evento ficam iguais pelos dois caminhos.
   * Devolve o estado novo para quem chamou levar a lista ao chip certo (a
   * conversa sai de Resolvidas/Arquivadas) e `null` quando falhou.
   */
  const reopenConversation = useCallback(async (
    contactId: string,
  ): Promise<{ status: string | null; reopened: boolean } | null> => {
    // RPC nova (t_0d2e2dec), types.ts ainda não sincronizado.
    const { data, error } = await (supabase as any).rpc('reopen_conversation', { p_contact_id: contactId }); // eslint-disable-line @typescript-eslint/no-explicit-any -- RPC nova (t_0d2e2dec), types.ts ainda não sincronizado
    const linha = Array.isArray(data) ? data[0] : data;
    if (error || !linha) {
      toast.error('Erro ao reabrir conversa. Tente novamente.');
      return null;
    }
    // `reopened=false`: o contato já estava ativo (outra pessoa reabriu antes) e
    // nenhum evento foi gravado — avisa em vez de dar sucesso por algo que não mudou.
    if (linha.reopened === false) {
      toast.info('A conversa já está ativa');
    } else {
      toast.success('Conversa reaberta');
    }
    return { status: linha.conversation_status ?? null, reopened: linha.reopened === true };
  }, []);

  const transferContact = useCallback(async (
    contactId: string,
    type: 'agent' | 'queue' | 'connection',
    targetId: string,
    note?: string,
  ) => {
    if (type === 'connection') {
      toast.error('Transferência por conexão ainda não é suportada');
      return;
    }

    const trimmedNote = note?.trim();
    const { error } = await supabase.rpc('transfer_conversation', {
      p_contact_id: contactId,
      p_to_agent_id: type === 'agent' ? targetId : null,
      p_to_queue_id: type === 'queue' ? targetId : null,
      p_note: trimmedNote || null,
    });

    // Rejeita (não só toast): quem chamou precisa saber que falhou — a sidebar
    // usa a rejeição pra manter o diálogo/alvo abertos. A RPC é transacional:
    // erro nela significa que nem UPDATE em contacts nem evento foram persistidos.
    if (error) { toast.error('Erro ao transferir conversa'); throw error; }
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
    reopenConversation,
    transferContact,
    profileId,
  };
}
