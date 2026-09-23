import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { deriveTaskGroups, type ConversationTask } from '@/hooks/chat/useConversationTasks';

export interface MyTask extends ConversationTask {
  contact?: { name: string; phone: string } | null;
}

export const myTasksKey = ['my-tasks'] as const;

/**
 * Tarefas cruzando todos os contatos do usuário — a mesma tabela conversation_tasks
 * da aba da conversa (useConversationTasks), sem o filtro de contact_id. O RLS de
 * conversation_tasks já faz o recorte: agent/special_agent vê só o que é dele
 * (atribuída, criada por ele, ou de contato visível); admin/supervisor vê tudo.
 */
export function useMyTasks() {
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: myTasksKey,
    queryFn: async (): Promise<MyTask[]> => {
      const { data, error } = await supabase
        .from('conversation_tasks')
        .select('*, contacts(name, phone)')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data || []) as Array<ConversationTask & { contacts?: { name: string; phone: string } | null }>;
      return rows.map((t) => ({ ...t, contact: t.contacts ?? null }));
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: myTasksKey });

  const toggleMutation = useMutation({
    mutationFn: async (task: MyTask) => {
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';
      const { error } = await supabase
        .from('conversation_tasks')
        .update({ status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : null })
        .eq('id', task.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('conversation_tasks').delete().eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Tarefa removida'); },
    onError: () => toast.error('Erro ao remover tarefa'),
  });

  // contact_id obrigatório: a policy de INSERT de conversation_tasks exige
  // is_contact_visible_to_user(contact_id, ...). Tarefa sem contato (to-do
  // pessoal solto) precisa de uma policy nova — fora de escopo desta tela.
  const createMutation = useMutation({
    mutationFn: async (input: { title: string; contactId: string; priority?: string; dueDate?: string | null; assignedTo?: string | null; createdBy?: string | null; description?: string | null }) => {
      const { error } = await supabase.from('conversation_tasks').insert({
        contact_id: input.contactId,
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

  const groups = useMemo(() => deriveTaskGroups(tasks), [tasks]);

  return {
    tasks,
    isLoading,
    ...groups,
    toggleTask: toggleMutation.mutateAsync,
    deleteTask: deleteMutation.mutateAsync,
    createTask: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}
