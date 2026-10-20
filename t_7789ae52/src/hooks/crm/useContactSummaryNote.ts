import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const contactSummaryNoteKey = (contactId: string | null | undefined) => ['contact-summary-note', contactId] as const;

/** Texto livre de `contacts.notes` — usado pelo card "Resumo comercial" da aba Notas (2.8). */
export function useContactSummaryNote(contactId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = contactSummaryNoteKey(contactId);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from('contacts').select('notes').eq('id', contactId as string).maybeSingle();
      if (error) throw error;
      return data?.notes ?? '';
    },
    enabled: !!contactId,
  });

  const mutation = useMutation({
    mutationFn: async (notes: string) => {
      const { error } = await supabase.from('contacts').update({ notes }).eq('id', contactId as string);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return { summary: data ?? '', isLoading, save: mutation.mutateAsync, isSaving: mutation.isPending };
}
