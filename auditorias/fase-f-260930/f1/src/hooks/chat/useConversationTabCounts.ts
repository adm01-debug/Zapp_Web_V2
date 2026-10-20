import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ConversationTabCounts {
  tasksOpen: number;
  notesTotal: number;
  filesTotal: number;
  remindersPending: number;
}

const EMPTY: ConversationTabCounts = { tasksOpen: 0, notesTotal: 0, filesTotal: 0, remindersPending: 0 };

/** Shape real do RPC — types.ts gerado ainda não reflete reminders_pending
 *  (fica desatualizado até o types-sync rodar pós-merge da migration). */
type TabCountsRpcRow = {
  tasks_open: number;
  notes_total: number;
  files_total: number;
  reminders_pending: number;
};

/**
 * Badges das abas da conversa (Tarefas / Notas / Arquivos / Lembretes).
 *
 * Usa a RPC get_conversation_tab_counts, que resolve os 4 counts numa única
 * ida ao banco — evita 4 queries por conversa aberta.
 */
export function useConversationTabCounts(contactId: string | null | undefined) {
  const query = useQuery({
    queryKey: ['conversation-tab-counts', contactId],
    queryFn: async (): Promise<ConversationTabCounts> => {
      if (!contactId) return EMPTY;

      const { data, error } = await supabase.rpc('get_conversation_tab_counts', {
        p_contact_id: contactId,
      });
      if (error) throw error;

      const row = (Array.isArray(data) ? data[0] : data) as TabCountsRpcRow | null;
      if (!row) return EMPTY;

      return {
        tasksOpen: Number(row.tasks_open ?? 0),
        notesTotal: Number(row.notes_total ?? 0),
        filesTotal: Number(row.files_total ?? 0),
        remindersPending: Number(row.reminders_pending ?? 0),
      };
    },
    enabled: !!contactId,
    staleTime: 30_000,
  });

  return { counts: query.data ?? EMPTY, isLoading: query.isLoading, refetch: query.refetch };
}

/** Query key exportada para invalidação a partir de outros módulos. */
export const conversationTabCountsKey = (contactId: string) =>
  ['conversation-tab-counts', contactId] as const;
