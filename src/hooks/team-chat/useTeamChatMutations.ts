import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from 'sonner';
import { TEAM_KEYS } from './queryKeys';

export function useSendTeamMessage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
      replyToId,
      mediaUrl,
      mediaType,
      mediaBucket,
      mediaPath,
    }: {
      conversationId: string;
      content: string;
      replyToId?: string;
      mediaUrl?: string;
      mediaType?: string;
      mediaBucket?: string;
      mediaPath?: string;
    }) => {
      if (!profile) throw new Error('Não autenticado');
      const { data, error } = await supabase.rpc('send_team_message', {
        p_conversation_id: conversationId,
        p_content: content,
        p_reply_to_id: replyToId,
        p_media_url: mediaUrl,
        p_media_type: mediaType,
        p_media_bucket: mediaBucket,
        p_media_path: mediaPath,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: TEAM_KEYS.messages(vars.conversationId) });
      void queryClient.invalidateQueries({ queryKey: TEAM_KEYS.inbox(profile?.id) });
    },
    onError: () => { toast.error('Erro ao enviar mensagem'); },
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
      void queryClient.invalidateQueries({ queryKey: TEAM_KEYS.messages(data.conversationId) });
    },
    onError: () => { toast.error('Erro ao excluir mensagem'); },
  });
}

export function useEditTeamMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, content, conversationId }: { messageId: string; content: string; conversationId: string }) => {
      const { error } = await supabase
        .from('team_messages')
        .update({ content, is_edited: true, updated_at: new Date().toISOString() })
        .eq('id', messageId);
      if (error) throw error;
      return { conversationId };
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: TEAM_KEYS.messages(data.conversationId) });
    },
    onError: () => { toast.error('Erro ao editar mensagem'); },
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
      if (!profile) throw new Error('Não autenticado');

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

      if (type === 'department' && departmentId) {
        const { data: existing } = await supabase
          .from('team_conversations')
          .select('id')
          .eq('department_id', departmentId)
          .maybeSingle();
        if (existing) return existing;

        const { data: conv, error } = await supabase
          .from('team_conversations')
          .insert({ type: 'department', name: name || null, created_by: profile.id, department_id: departmentId })
          .select()
          .single();
        if (error) throw error;
        const { error: memError } = await supabase
          .from('team_conversation_members')
          .insert([{ conversation_id: conv.id, profile_id: profile.id }]);
        if (memError) throw memError;
        return conv;
      }

      const { data: conv, error } = await supabase
        .from('team_conversations')
        .insert({ type, name: name || null, created_by: profile.id })
        .select()
        .single();
      if (error) throw error;
      const allMembers = [profile.id, ...memberIds.filter(id => id !== profile.id)];
      const { error: memError } = await supabase
        .from('team_conversation_members')
        .insert(allMembers.map(pid => ({ conversation_id: conv.id, profile_id: pid })));
      if (memError) throw memError;
      return conv;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEAM_KEYS.inbox(profile?.id) });
    },
    onError: () => { toast.error('Erro ao criar conversa'); },
  });
}

export function useToggleMuteConversation() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, muted }: { conversationId: string; muted: boolean }) => {
      if (!profile) throw new Error('Não autenticado');
      const { error } = await supabase.rpc('set_team_member_pref', {
        p_conversation_id: conversationId,
        p_is_muted: muted,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEAM_KEYS.inbox(profile?.id) });
    },
    onError: () => { toast.error('Erro ao alterar silenciar'); },
  });
}

export function useRenameConversation() {
  const { profile } = useAuth();
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
      void queryClient.invalidateQueries({ queryKey: TEAM_KEYS.inbox(profile?.id) });
      toast.success('Grupo renomeado com sucesso');
    },
    onError: () => { toast.error('Erro ao renomear grupo'); },
  });
}

export function useRemoveConversationMember() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, profileId }: { conversationId: string; profileId: string }) => {
      const { data, error } = await supabase.rpc('remove_team_member', {
        p_conversation_id: conversationId,
        p_profile_id: profileId,
      });
      if (error) throw error;
      return data as { ok: boolean; group_deleted?: boolean; conversation_id: string };
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: TEAM_KEYS.members(data.conversation_id) });
      void queryClient.invalidateQueries({ queryKey: TEAM_KEYS.inbox(profile?.id) });
      toast.success('Membro removido');
    },
    onError: () => { toast.error('Erro ao remover membro'); },
  });
}

export function useLeaveConversation() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId }: { conversationId: string }) => {
      const { data, error } = await supabase.rpc('leave_team_group', {
        p_conversation_id: conversationId,
      });
      if (error) throw error;
      return data as { ok: boolean; group_deleted?: boolean; conversation_id: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEAM_KEYS.inbox(profile?.id) });
    },
    onError: () => { toast.error('Erro ao sair do grupo'); },
  });
}

export function useDeleteConversation() {
  const { profile } = useAuth();
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
      void queryClient.invalidateQueries({ queryKey: TEAM_KEYS.inbox(profile?.id) });
    },
    onError: () => { toast.error('Erro ao excluir grupo'); },
  });
}

export function useTransferDepartment() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, toDepartmentId }: { conversationId: string; toDepartmentId: string }) => {
      const { error } = await supabase.rpc('transfer_team_conversation_department', {
        p_conversation_id: conversationId,
        p_to_department_id: toDepartmentId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEAM_KEYS.inbox(profile?.id) });
      toast.success('Canal transferido com sucesso');
    },
    onError: () => { toast.error('Erro ao transferir canal'); },
  });
}
