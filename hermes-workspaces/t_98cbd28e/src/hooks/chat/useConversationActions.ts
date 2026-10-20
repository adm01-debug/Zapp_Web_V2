import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { addHours, startOfTomorrow, addDays, setHours } from 'date-fns';
import { undoToast } from '@/lib/undoToast';

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
    let snoozeUntil: Date;
    const now = new Date();
    switch (duration) {
      case '1h': snoozeUntil = addHours(now, 1); break;
      case '3h': snoozeUntil = addHours(now, 3); break;
      case 'tomorrow': snoozeUntil = setHours(startOfTomorrow(), 9); break;
      case 'nextweek': snoozeUntil = setHours(addDays(now, 7 - now.getDay() + 1), 9); break;
      default: snoozeUntil = addHours(now, 1);
    }

    await supabase
      .from('conversation_snoozes')
      .delete()
      .eq('contact_id', contactId)
      .eq('snoozed_by', profileId);

    const { error } = await supabase
      .from('conversation_snoozes')
      .insert({
        contact_id: contactId,
        snoozed_by: profileId,
        snooze_until: snoozeUntil.toISOString(),
      });
    if (!error) {
      const until = snoozeUntil.getTime();
      setSnoozes((prev) => {
        const next = new Map(prev);
        next.set(contactId, until);
        return next;
      });
      setAgora(Date.now());
      _snoozeBus.dispatchEvent(new CustomEvent<SnoozeChange>('change', { detail: { contactId, until } }));
      toast.success('Conversa adiada');
    }
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
    const updateData: { assigned_to?: string; queue_id?: string } =
      type === 'agent' ? { assigned_to: targetId } : { queue_id: targetId };
    const { error } = await supabase.from('contacts').update(updateData).eq('id', contactId);
    // Rejeita (não só toast): quem chamou precisa saber que falhou — a sidebar
    // usa a rejeição pra manter o diálogo/alvo abertos.
    if (error) { toast.error('Erro ao transferir conversa'); throw error; }
    const trimmedNote = note?.trim();
    const { error: eventError } = await supabase.from('conversation_events').insert({
      event_type: 'transfer',
      contact_id: contactId,
      ...(type === 'agent' ? { to_agent_id: targetId } : { to_queue_id: targetId }),
      ...(trimmedNote ? { metadata: { note: trimmedNote } } : {}),
    });
    if (eventError) {
      // Falha ao gravar o evento é falha da transferência: rejeita (não resolve)
      // para a sidebar manter diálogo/alvo abertos, e não sinaliza sucesso.
      toast.error('Conversa transferida, mas o registro do evento falhou');
      throw eventError;
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
