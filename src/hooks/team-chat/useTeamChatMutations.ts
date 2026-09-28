import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { teamChatKeys } from './queryKeys';

// E60: helper de upload para o bucket team-chat-files
export async function uploadTeamMedia(file: File): Promise<{ path: string; url: string }> {
  const ext = file.name.split('.').pop() ?? 'bin';
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('team-chat-files').upload(path, file);
  if (error) throw error;
  const { data } = await supabase.storage.from('team-chat-files').createSignedUrl(path, 3600);
  return { path, url: data?.signedUrl ?? '' };
}

export function useSendTeamMessage() {
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
      messageType = 'text',
    }: {
      conversationId: string;
      content?: string;
      replyToId?: string;
      mediaUrl?: string;
      mediaType?: string;
      mediaBucket?: string;
      mediaPath?: string;
      messageType?: string;
    }) => {
      const { data, error } = await supabase.rpc('send_team_message', {
        p_conversation_id: conversationId,
        p_content: content ?? null,
        p_message_type: messageType,
        p_reply_to_id: replyToId ?? null,
        p_media_url: mediaUrl ?? null,
        p_media_type: mediaType ?? null,
        p_media_bucket: mediaBucket ?? null,
        p_media_path: mediaPath ?? null,
      });
      if (error) throw error;
      const result = data as { success: boolean; message_id?: string; error?: string };
      if (!result.success) throw new Error(result.error ?? 'send_failed');
      return result;
    },
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: teamChatKeys.messagePages(vars.conversationId) });
      void queryClient.invalidateQueries({ queryKey: teamChatKeys.conversations() });
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
      void queryClient.invalidateQueries({ queryKey: teamChatKeys.messagePages(data.conversationId) });
      void queryClient.invalidateQueries({ queryKey: teamChatKeys.conversations() });
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
      void queryClient.invalidateQueries({ queryKey: teamChatKeys.messagePages(data.conversationId) });
    },
    onError: () => { toast.error('Erro ao editar mensagem'); },
  });
}

export function useCreateTeamConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      type,
      name,
      memberIds = [],
      departmentId,
    }: {
      type: 'direct' | 'group' | 'department' | 'announcement';
      name?: string;
      memberIds?: string[];
      departmentId?: string;
    }) => {
      if (type === 'direct' && memberIds.length === 1) {
        const { data: convId, error } = await supabase.rpc('find_or_create_direct_conversation', {
          other_profile_id: memberIds[0],
        });
        if (error) throw error;
        return { conversation_id: convId as string };
      }

      const { data, error } = await supabase.rpc('create_team_conversation', {
        p_name: name ?? null,
        p_type: type,
        p_department_id: departmentId ?? null,
        p_initial_members: memberIds,
        p_metadata: {},
      });
      if (error) throw error;
      const result = data as { success: boolean; conversation_id?: string; error?: string };
      if (!result.success) throw new Error(result.error ?? 'create_failed');
      return result;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: teamChatKeys.conversations() }); },
    onError: () => { toast.error('Erro ao criar conversa'); },
  });
}

export function useToggleMuteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, muted, profileId }: { conversationId: string; muted: boolean; profileId: string }) => {
      const { error } = await supabase
        .from('team_conversation_members')
        .update({ is_muted: muted })
        .eq('conversation_id', conversationId)
        .eq('profile_id', profileId);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: teamChatKeys.conversations() }); },
    onError: () => { toast.error('Erro ao alterar silenciar'); },
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
      void queryClient.invalidateQueries({ queryKey: teamChatKeys.conversations() });
      toast.success('Grupo renomeado com sucesso');
    },
    onError: () => { toast.error('Erro ao renomear grupo'); },
  });
}

export function useRemoveConversationMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, profileId }: { conversationId: string; profileId: string }) => {
      const { data, error } = await supabase.rpc('remove_team_conversation_member', {
        p_conversation_id: conversationId,
        p_user_id: profileId,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error ?? 'remove_failed');
      return { conversationId };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamChatKeys.conversations() });
      toast.success('Membro removido');
    },
    onError: () => { toast.error('Erro ao remover membro'); },
  });
}

export function useLeaveConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId }: { conversationId: string }) => {
      const { data, error } = await supabase.rpc('leave_team_conversation', {
        p_conversation_id: conversationId,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error ?? 'leave_failed');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamChatKeys.conversations() });
    },
    onError: () => { toast.error('Erro ao sair do grupo'); },
  });
}

export function useTransferConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, newOwnerId }: { conversationId: string; newOwnerId: string }) => {
      const { error } = await supabase
        .from('team_conversations')
        .update({ created_by: newOwnerId })
        .eq('id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamChatKeys.conversations() });
      toast.success('Propriedade do grupo transferida com sucesso');
    },
    onError: () => { toast.error('Erro ao transferir grupo'); },
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
      void queryClient.invalidateQueries({ queryKey: teamChatKeys.conversations() });
    },
    onError: () => { toast.error('Erro ao excluir grupo'); },
  });
}
