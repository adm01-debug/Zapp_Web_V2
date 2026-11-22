/**
 * Fase 2 do assistente pessoal — Memória: a agenda do contato.
 *
 * Lê os lembretes futuros do contato (`conversation_tasks`, o modelo canônico do
 * quadro de tarefas desde 20260928140000_tasks_unify_reminders_kanban.sql — a
 * tabela `reminders` é legado e já foi migrada por backfill) para que a conversa
 * mostre "você tem um compromisso com fulano amanhã", e grava um lembrete com um
 * clique quando o cliente pede contato numa data.
 *
 * A leitura é feita por `useQuery` (padrão dos hooks de leitura do app): o cache
 * é invalidado depois do insert, então o compromisso recém-criado aparece na
 * mesma lista sem estado local duplicado.
 */
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { log } from '@/lib/logger';
import { assertRemindNotInPast } from '@/hooks/tasks/useMyWorkItems';

export type AgendaItem = {
  id: string;
  title: string;
  remindAt: string;
  status: string;
};

/** Apenas itens futuros e abertos interessam para "compromisso com o contato". */
function isFutureOpen(remindAt: string | null, status: string, now: Date): boolean {
  if (!remindAt) return false;
  if (status === 'done' || status === 'cancelled') return false;
  return new Date(remindAt).getTime() >= now.getTime();
}

export interface CreateReminderInput {
  contactId: string;
  title: string;
  remindAt: string;
  description?: string | null;
  /** Chave idempotente do clique: o mesmo clique reenviado não cria duas tarefas. */
  clientTaskId?: string | null;
}

const agendaKey = (contactId: string) => ['assistant-contact-agenda', contactId] as const;

async function fetchAgenda(contactId: string): Promise<AgendaItem[]> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('conversation_tasks')
    .select('id, title, remind_at, status')
    .eq('contact_id', contactId)
    .not('remind_at', 'is', null)
    .gte('remind_at', nowIso)
    .not('status', 'in', '(done,cancelled)')
    .order('remind_at', { ascending: true })
    .limit(10);

  if (error) throw error;

  const now = new Date();
  return ((data ?? []) as Array<{ id: string; title: string; remind_at: string | null; status: string }>)
    .filter((row) => isFutureOpen(row.remind_at, row.status, now))
    .map((row) => ({
      id: row.id,
      title: row.title,
      remindAt: row.remind_at as string,
      status: row.status,
    }));
}

export function useContactAgenda(contactId: string | null | undefined) {
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: agendaKey(contactId ?? ''),
    queryFn: () => fetchAgenda(contactId as string),
    enabled: Boolean(contactId && profileId),
    staleTime: 30_000,
  });

  // Ausência de dado não pode ser lida como "não há compromisso": a UI mostra o
  // alerta em vez de esconder a agenda.
  const isError = query.isError;
  if (isError) log.error('Erro ao ler a agenda do contato:', query.error);

  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: agendaKey(contactId ?? '') });
  }, [queryClient, contactId]);

  const mutation = useMutation({
    mutationFn: async (input: CreateReminderInput): Promise<string | null> => {
      // Mesma guarda da etapa 17 do quadro: horário no passado é recusado antes
      // de tocar o banco, com o motivo em `blocked` para a UI traduzir.
      assertRemindNotInPast(input.remindAt);

      const { data, error } = await supabase
        .from('conversation_tasks')
        .insert({
          title: input.title,
          description: input.description ?? null,
          contact_id: input.contactId,
          created_by: profileId,
          assigned_to: profileId,
          priority: 'medium',
          status: 'todo',
          position: 0,
          remind_at: input.remindAt,
          client_task_id: input.clientTaskId ?? crypto.randomUUID(),
        })
        .select('id')
        .single();

      if (error) {
        // 23505 = a chave idempotente já existe: o pedido é o mesmo, não é erro.
        if ((error as { code?: string }).code === '23505') return null;
        throw error;
      }

      return (data as { id: string } | null)?.id ?? null;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: agendaKey(contactId ?? '') });
    },
  });

  const createReminder = useCallback(
    async (input: CreateReminderInput): Promise<string | null> => {
      if (!profileId) throw new Error('sem perfil');
      return mutation.mutateAsync(input);
    },
    [mutation, profileId]
  );

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError,
    reload,
    createReminder,
  };
}