import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from '@/hooks/ui/use-toast';

export interface ScheduledMessage {
  id: string;
  contact_id: string;
  content: string;
  message_type: string;
  media_url: string | null;
  scheduled_at: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  sent_at: string | null;
  error_message: string | null;
  created_by: string | null;
  whatsapp_connection_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useScheduledMessages(contactId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['scheduled-messages', contactId],
    queryFn: async () => {
      let query = supabase
        .from('scheduled_messages')
        .select('*')
        .order('scheduled_at', { ascending: true });

      if (contactId) {
        query = query.eq('contact_id', contactId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ScheduledMessage[];
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async (data: {
      contactId: string;
      content: string;
      scheduledAt: Date;
      messageType?: string;
      mediaUrl?: string;
      connectionId?: string;
    }) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user?.id ?? '')
        .maybeSingle();

      const { data: msg, error } = await supabase
        .from('scheduled_messages')
        .insert({
          contact_id: data.contactId,
          content: data.content,
          scheduled_at: data.scheduledAt.toISOString(),
          message_type: data.messageType || 'text',
          media_url: data.mediaUrl || null,
          created_by: profile?.id || null,
          whatsapp_connection_id: data.connectionId || null,
        })
        .select()
        .single();

      if (error) throw error;
      return msg;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages'] });
      toast({ title: 'Mensagem agendada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao agendar mensagem', description: error.message, variant: 'destructive' });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from('scheduled_messages')
        .update({ status: 'cancelled' })
        .eq('id', messageId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages'] });
      toast({ title: 'Agendamento cancelado' });
    },
  });

  return {
    messages,
    isLoading,
    scheduleMessage: scheduleMutation.mutateAsync,
    cancelMessage: cancelMutation.mutateAsync,
    isScheduling: scheduleMutation.isPending,
  };
}