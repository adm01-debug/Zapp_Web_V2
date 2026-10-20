import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { conversationTabCountsKey } from '@/hooks/chat/useConversationTabCounts';

export interface ConversationTask {
  id: string;
  contact_id: string | null;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  assigned_to: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const conversationTasksKey = (contactId: string) => ['conversation-tasks', contactId] as const;

function isToday(dateIso: string) {
  const d = new Date(dateIso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isOverdue(dateIso: string) {
  return new Date(dateIso).getTime() < Date.now() && !isToday(dateIso);
}

function isWithinDays(dateIso: string, days: number) {
  const diffMs = Date.now() - new Date(dateIso).getTime();
  return diffMs >= 0 && diffMs <= days * 24 * 60 * 60 * 1000;
}

/** Deriva os agrupamentos usados pelas abas Tarefas/Notas a partir da lista crua. Função pura — testável sem rede. */
export function deriveTaskGroups(tasks: ConversationTask[]) {
  const open = tasks.filter((t) => t.status !== 'completed');
  const completed = tasks.filter((t) => t.status === 'completed');

  const overdue = open.filter((t) => t.due_date && isOverdue(t.due_date));
  const today = open.filter((t) => t.due_date && isToday(t.due_date));
  const upcoming = open.filter((t) => !t.due_date || (!isOverdue(t.due_date) && !isToday(t.due_date)));
  const completed7d = completed.filter((t) => t.completed_at && isWithinDays(t.completed_at, 7));

  return { open, completed, overdue, today, upcoming, completed7d };
}

export function useConversationTasks(contactId: string | null | undefined) {
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: conversationTasksKey(contactId as string),
    queryFn: async (): Promise<ConversationTask[]> => {
      const { data, error } = await supabase
        .from('conversation_tasks')
        .select('*')
        .eq('contact_id', contactId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!contactId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: conversationTasksKey(contactId as string) });
    if (contactId) queryClient.invalidateQueries({ queryKey: conversationTabCountsKey(contactId) });
  };

  const createMutation = useMutation({
    mutationFn: async (input: { title: string; priority?: string; dueDate?: string | null; assignedTo?: string | null; createdBy?: string | null; description?: string | null }) => {
      const { error } = await supabase.from('conversation_tasks').insert({
        contact_id: contactId,
        title: input.title,
        priority: input.priority ?? 'medium',
        due_date: input.dueDate ?? null,
        assigned_to: input.assignedTo ?? input.createdBy ?? null,
        created_by: input.createdBy ?? null,
        description: input.description ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Tarefa criada'); },
    onError: () => toast.error('Erro ao criar tarefa'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ConversationTask> }) => {
      const { error } = await supabase.from('conversation_tasks').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: () => toast.error('Erro ao atualizar tarefa'),
  });

  const toggleMutation = useMutation({
    mutationFn: async (task: ConversationTask) => {
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';
      const { error } = await supabase
        .from('conversation_tasks')
        .update({ status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : null })
        .eq('id', task.id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('conversation_tasks').delete().eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Tarefa removida'); },
    onError: () => toast.error('Erro ao remover tarefa'),
  });

  const groups = useMemo(() => deriveTaskGroups(tasks), [tasks]);

  return {
    tasks,
    isLoading,
    ...groups,
    createTask: createMutation.mutateAsync,
    updateTask: (id: string, updates: Partial<ConversationTask>) => updateMutation.mutateAsync({ id, updates }),
    toggleTask: toggleMutation.mutateAsync,
    deleteTask: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}
