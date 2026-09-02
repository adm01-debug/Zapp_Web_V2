import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { toast } from 'sonner';
import { useActionFeedback } from '@/hooks/ui/useActionFeedback';
import type { WhatsAppGroup, WhatsAppConnection } from './types';

interface UseGroupActionsParams {
  connections: WhatsAppConnection[];
  groups: WhatsAppGroup[];
  selectedGroups: Set<string>;
  setGroups: React.Dispatch<React.SetStateAction<WhatsAppGroup[]>>;
  setSelectedGroups: React.Dispatch<React.SetStateAction<Set<string>>>;
  fetchGroups: () => Promise<void>;
}

export function useGroupActions({ connections, groups, selectedGroups, setGroups, setSelectedGroups, fetchGroups }: UseGroupActionsParams) {
  const feedback = useActionFeedback();

  const handleAutoSync = useCallback(async (setIsSyncing: (v: boolean) => void) => {
    if (connections.length === 0) {
      toast.error('Nenhuma conexão WhatsApp configurada');
      return;
    }

    setIsSyncing(true);
    let totalSynced = 0;
    let totalErrors = 0;

    for (const conn of connections) {
      if (!conn.instance_id) continue;
      try {
        const { data, error } = await supabase.functions.invoke('evolution-api', {
          body: { action: 'list-groups', instanceName: conn.instance_id, getParticipants: 'false' },
        });
        if (error) { totalErrors++; continue; }

        const apiGroups = Array.isArray(data) ? data : (data?.data || data?.groups || []);
        for (const g of apiGroups) {
          // Shapes: Evolution v2 {id, subject, desc, size} · Evolution GO/whatsmeow {JID, Name, Topic, Participants}
          const groupJid = g.id || g.jid || g.groupJid || g.JID;
          if (!groupJid) continue;
          const { error: upsertError } = await supabase.from('whatsapp_groups').upsert({
            group_id: groupJid,
            name: g.subject || g.name || g.Name || 'Grupo sem nome',
            description: g.desc || g.description || g.Topic || null,
            participant_count: g.size || g.participants?.length || g.Participants?.length || 0,
            is_admin: g.announce === true || g.iAmAdmin === true || g.IsAnnounce === true,
            whatsapp_connection_id: conn.id,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'group_id' });
          if (upsertError) log.error(`Error upserting group ${groupJid}:`, upsertError);
          else totalSynced++;
        }
      } catch (err) { log.error(`Sync error for connection ${conn.name}:`, err); totalErrors++; }
    }

    setIsSyncing(false);
    await fetchGroups();
    if (totalErrors > 0) toast.warning(`Sincronização parcial: ${totalSynced} grupos, ${totalErrors} erro(s)`);
    else toast.success(`${totalSynced} grupo(s) sincronizados!`);
  }, [connections, fetchGroups]);

  const handleAddGroup = useCallback(async (newGroup: { name: string; group_id: string; description: string; whatsapp_connection_id: string; category: string }) => {
    if (!newGroup.name || !newGroup.group_id) { feedback.warning('Preencha os campos obrigatórios'); return false; }
    let success = false;
    await feedback.withFeedback(
      async () => {
        const { error } = await supabase.from('whatsapp_groups').insert({
          name: newGroup.name, group_id: newGroup.group_id, description: newGroup.description || null,
          whatsapp_connection_id: newGroup.whatsapp_connection_id || null, category: newGroup.category || null,
        });
        if (error) throw error;
      },
      { loadingMessage: 'Adicionando grupo...', successMessage: 'Grupo adicionado!', errorMessage: 'Erro ao adicionar grupo',
        onSuccess: () => { success = true; fetchGroups(); } }
    );
    return success;
  }, [feedback, fetchGroups]);

  const handleDeleteGroup = useCallback(async (id: string) => {
    await feedback.withFeedback(
      async () => { const { error } = await supabase.from('whatsapp_groups').delete().eq('id', id); if (error) throw error; },
      { loadingMessage: 'Excluindo...', successMessage: 'Grupo excluído!', errorMessage: 'Erro ao excluir', onSuccess: () => fetchGroups() }
    );
  }, [feedback, fetchGroups]);

  const handleBroadcast = useCallback(async (broadcastMessage: string) => {
    if (!broadcastMessage.trim()) { toast.error('Digite uma mensagem'); return; }
    const groupsToSend = groups.filter(g => selectedGroups.has(g.id));
    if (groupsToSend.length === 0) { toast.error('Selecione pelo menos um grupo'); return; }

    let sent = 0, failed = 0;
    for (const group of groupsToSend) {
      const conn = connections.find(c => c.id === group.whatsapp_connection_id);
      if (!conn?.instance_id) { failed++; continue; }
      try {
        const { error } = await supabase.functions.invoke('evolution-api', {
          body: { action: 'send-text', instanceName: conn.instance_id, number: group.group_id, text: broadcastMessage },
        });
        if (error) failed++; else sent++;
        if (groupsToSend.indexOf(group) < groupsToSend.length - 1) await new Promise(r => setTimeout(r, 2000));
      } catch { failed++; }
    }
    setSelectedGroups(new Set());
    if (failed > 0) toast.warning(`Enviado para ${sent} grupo(s), ${failed} falha(s)`);
    else toast.success(`Mensagem enviada para ${sent} grupo(s)!`);
  }, [connections, groups, selectedGroups, setSelectedGroups]);

  const handleCategoryChange = useCallback(async (groupId: string, category: string | null) => {
    const { error } = await supabase.from('whatsapp_groups').update({ category }).eq('id', groupId);
    if (error) { toast.error('Erro ao atualizar categoria'); return; }
    toast.success('Categoria atualizada');
    const group = groups.find(g => g.id === groupId);
    if (group) {
      await supabase.from('contacts').update({ group_category: category }).like('phone', `%${group.group_id.replace('@g.us', '')}%`);
    }
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, category } : g));
  }, [groups, setGroups]);

  return { handleAutoSync, handleAddGroup, handleDeleteGroup, handleBroadcast, handleCategoryChange };
}
