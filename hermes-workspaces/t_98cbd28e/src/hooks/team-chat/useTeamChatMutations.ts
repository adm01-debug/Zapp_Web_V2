import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from '@/hooks/ui/use-toast';

export function useSendTeamMessage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, content, replyToId, mediaUrl, mediaType, mediaBucket, mediaPath }: {
      conversationId: string;
      content: string;
      replyToId?: string;
      mediaUrl?: string;
      mediaType?: string;
      mediaBucket?: string;
      mediaPath?: string;
    }) => {
      if (!profile) throw new Error('Not authenticated');
      const { data, error } = await supabase.from('team_messages').insert({
        conversation_id: conversationId,
        sender_id: profile.id,
        content,
        reply_to_id: replyToId || null,
        media_url: mediaUrl || null,
        media_type: mediaType || null,
        media_bucket: mediaBucket || null,
        media_path: mediaPath || null,
      }).select().single();
      if (error) throw error;
      await supabase.from('team_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['team-messages', vars.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
    },
    onError: () => { toast({ title: 'Erro ao enviar mensagem', variant: 'destructive' }); },
  });
}

export function useDeleteTeamMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, conversationId }: { messageId: string; conversationId: string }) => {
      const { error } = await supabase.from('team_messages').delete().eq('id', messageId);
      if (error) throw error;
      return { conversationId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['team-messages', data.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
    },
    onError: () => { toast({ title: 'Erro ao excluir mensagem', variant: 'destructive' }); },
  });
}

export function useEditTeamMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, content, conversationId }: { messageId: string; content: string; conversationId: string }) => {
      const { error } = await supabase.from('team_messages').update({ content, is_edited: true, updated_at: new Date().toISOString() }).eq('id', messageId);
      if (error) throw error;
      return { conversationId };
    },
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ['team-messages', data.conversationId] }); },
    onError: () => { toast({ title: 'Erro ao editar mensagem', variant: 'destructive' }); },
  });
}

export function useCreateTeamConversation() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      type,
      name,
      memberIds = [],
      departmentId,
    }: {
      type: 'direct' | 'group' | 'department';
      name?: string;
      memberIds?: string[];
      departmentId?: string;
    }) => {
      if (!profile) throw new Error('Not authenticated');

      if (type === 'direct' && memberIds.length === 1) {
        const { data: convId, error: rpcErr } = await supabase.rpc('find_or_create_direct_conversation', {
          other_profile_id: memberIds[0],
        });
        if (rpcErr) throw rpcErr;
        const { data: conv, error: convErr } = await supabase
          .from('team_conversations')
          .select('*')
          .eq('id', convId as string)
          .single();
        if (convErr) throw convErr;
        return conv;
      }

      // Grupo/departamento nasce numa operacao atomica no banco: conversa + membership
      // (criador vira owner). Antes eram duas requests e a policy de INSERT exigia membro
      // previo, entao agente nao-admin deixava a conversa orfa (TC-003).
      const { data: convId, error: rpcErr } = await supabase.rpc('create_team_group_conversation', {
        p_name: name || undefined,
        p_member_ids: memberIds.filter(id => id !== profile.id),
        p_department_id: type === 'department' ? departmentId : undefined,
      });
      if (rpcErr) throw rpcErr;
      const { data: conv, error: convErr } = await supabase
        .from('team_conversations')
        .select('*')
        .eq('id', convId as string)
        .single();
      if (convErr) throw convErr;
      return conv;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['team-conversations'] }); },
    onError: () => { toast({ title: 'Erro ao criar conversa', variant: 'destructive' }); },
  });
}

export function useToggleMuteConversation() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, muted }: { conversationId: string; muted: boolean }) => {
      if (!profile) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('team_conversation_members')
        .update({ is_muted: muted })
        .eq('conversation_id', conversationId)
        .eq('profile_id', profile.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['team-conversations'] }); },
    onError: () => { toast({ title: 'Erro ao alterar silenciar', variant: 'destructive' }); },
  });
}

export function useRenameConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, name }: { conversationId: string; name: string }) => {
      const { error } = await supabase
        .from('team_conversations')
        .update({ name })
        .eq('id', conversationId);
      if (error) throw error;
      return { conversationId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
      toast({ title: 'Grupo renomeado com sucesso' });
    },
    onError: () => { toast({ title: 'Erro ao renomear grupo', variant: 'destructive' }); },
  });
}

export function useRemoveConversationMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, profileId }: { conversationId: string; profileId: string }) => {
      const { error } = await supabase
        .from('team_conversation_members')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('profile_id', profileId);
      if (error) throw error;
      return { conversationId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
      toast({ title: 'Membro removido' });
    },
    onError: () => { toast({ title: 'Erro ao remover membro', variant: 'destructive' }); },
  });
}

export function useLeaveConversation() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId }: { conversationId: string }) => {
      if (!profile) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('team_conversation_members')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('profile_id', profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
    },
    onError: () => { toast({ title: 'Erro ao sair do grupo', variant: 'destructive' }); },
  });
}

export function useTransferConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, newOwnerId }: { conversationId: string; newOwnerId: string }) => {
      // created_by nao e mais gravavel por DML (grant por coluna); a transferencia
      // canonica e a RPC, que exige owner/admin e alvo membro (TC-003).
      const { error } = await supabase.rpc('transfer_team_conversation_ownership', {
        p_conversation_id: conversationId,
        p_new_owner_id: newOwnerId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
      toast({ title: 'Propriedade do grupo transferida com sucesso' });
    },
    onError: () => { toast({ title: 'Erro ao transferir grupo', variant: 'destructive' }); },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId }: { conversationId: string }) => {
      const { error } = await supabase
        .from('team_conversations')
        .delete()
        .eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
    },
    onError: () => { toast({ title: 'Erro ao excluir grupo', variant: 'destructive' }); },
  });
}
