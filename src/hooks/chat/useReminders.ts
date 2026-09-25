import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Reminder {
  id: string;
  title: string;
  remind_at: string;
  is_dismissed: boolean;
  created_at: string;
}

export const remindersKey = (contactId: string, profileId: string) =>
  ['reminders', contactId, profileId] as const;

/**
 * Lembretes por contato, escopados ao agente logado (profile_id) — mesmo
 * padrao de useConversationTasks, mas sobre a tabela `reminders` (RLS:
 * "Users can manage own reminders", profile_id = auth.uid() via profiles).
 */
export function useReminders(contactId: string, profileId: string | undefined | null) {
  const queryClient = useQueryClient();
  const key = remindersKey(contactId, profileId ?? '');

  const { data: reminders = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Reminder[]> => {
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('contact_id', contactId)
        .eq('profile_id', profileId as string)
        .eq('is_dismissed', false)
        .order('remind_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!contactId && !!profileId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMutation = useMutation({
    mutationFn: async (input: { title: string; remindAt: Date }) => {
      const { error } = await supabase.from('reminders').insert({
        contact_id: contactId,
        profile_id: profileId as string,
        title: input.title,
        remind_at: input.remindAt.toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Lembrete criado'); },
    onError: () => toast.error('Erro ao criar lembrete'),
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reminders').update({ is_dismissed: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Lembrete dispensado'); },
    onError: () => toast.error('Erro ao dispensar lembrete'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reminders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: () => toast.error('Erro ao remover lembrete'),
  });

  return {
    reminders,
    isLoading,
    createReminder: createMutation.mutateAsync,
    dismissReminder: dismissMutation.mutateAsync,
    deleteReminder: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}
