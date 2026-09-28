import { useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { undoToast } from '@/lib/undoToast';
import { useAuth } from '@/hooks/auth/useAuth';
import {
  canTransition,
  applyTransition,
  countDoing,
} from './workItemMachine';
import { bucketByDue, bucketByStatus, kpis } from './workItemAggregates';
import type { WorkItem, WorkItemStatus, Priority } from './workItem.types';

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const workItemsKey = (profileId: string, opts?: { contactId?: string }) =>
  ['work-items', profileId, opts?.contactId ?? 'all'] as const;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------
interface UseMyWorkItemsOpts {
  /** Quando informado, limita aos itens do contato (aba Tarefas do chat). */
  contactId?: string;
  /** Inclui itens concluídos na query (para coluna Done do Quadro). */
  includeDone?: boolean;
  /** Inclui cancelados (somente filtro "Canceladas"). */
  includeCancelled?: boolean;
}

// ---------------------------------------------------------------------------
// Tipo de entrada para create/update
// ---------------------------------------------------------------------------
export interface WorkItemInput {
  title: string;
  description?: string | null;
  contactId?: string | null;
  priority?: Priority;
  dueDate?: string | null;
  remindAt?: string | null;
  status?: WorkItemStatus;
  waitingReason?: string | null;
}

// ---------------------------------------------------------------------------
// Hook principal
// ---------------------------------------------------------------------------
export function useMyWorkItems(opts: UseMyWorkItemsOpts = {}) {
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';
  const queryClient = useQueryClient();
  const key = workItemsKey(profileId, opts);

  // Ref para flag de primeiro mount (animação de entrada só no mount)
  const hasMountedRef = useRef(false);
  useEffect(() => {
    hasMountedRef.current = true;
  }, []);

  // ---- Query ---------------------------------------------------------------
  const { data: items = [], isLoading, isError, refetch } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<WorkItem[]> => {
      if (!profileId) return [];
      let q = supabase
        .from('conversation_tasks')
        .select('*')
        .eq('created_by', profileId)   // RLS também filtra, mas explícito é mais rápido
        .order('position', { ascending: true })
        .order('created_at', { ascending: false });

      if (opts.contactId) q = q.eq('contact_id', opts.contactId);

      // Filtrar status excluídos da query (coluna Done não precisa de dados antigos)
      const excludeStatus: WorkItemStatus[] = [];
      if (!opts.includeDone)       excludeStatus.push('done');
      if (!opts.includeCancelled)  excludeStatus.push('cancelled');
      if (excludeStatus.length > 0) {
        q = q.not('status', 'in', '(' + excludeStatus.map(s => '"' + s + '"').join(',') + ')');
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as WorkItem[];
    },
    enabled: !!profileId,
    staleTime: 30_000,
  });

  // ---- Realtime ------------------------------------------------------------
  useEffect(() => {
    if (!profileId) return;
    const channel = supabase
      .channel('work-items:' + profileId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_tasks',
          filter: 'created_by=eq.' + profileId,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['work-items', profileId] });
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [profileId, queryClient]);

  // ---- Mutações ------------------------------------------------------------
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['work-items', profileId] });

  // create
  const createMutation = useMutation({
    mutationFn: async (input: WorkItemInput) => {
      const { error } = await supabase.from('conversation_tasks').insert({
        title: input.title,
        description: input.description ?? null,
        contact_id: input.contactId ?? null,
        created_by: profileId,
        assigned_to: profileId,           // sempre = created_by
        priority: input.priority ?? 'medium',
        status: input.status ?? 'backlog',
        due_date: input.dueDate ?? null,
        remind_at: input.remindAt ?? null,
        waiting_reason: input.waitingReason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Tarefa criada'); },
    onError: () => toast.error('Erro ao criar tarefa'),
  });

  // update
  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<WorkItemInput> }) => {
      const { error } = await supabase.from('conversation_tasks').update({
        ...(patch.title !== undefined      && { title: patch.title }),
        ...(patch.description !== undefined && { description: patch.description }),
        ...(patch.priority !== undefined    && { priority: patch.priority }),
        ...(patch.dueDate !== undefined     && { due_date: patch.dueDate }),
        ...(patch.remindAt !== undefined    && { remind_at: patch.remindAt }),
        ...(patch.waitingReason !== undefined && { waiting_reason: patch.waitingReason }),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: () => toast.error('Erro ao atualizar tarefa'),
  });

  // move (transição de status)
  const moveMutation = useMutation({
    mutationFn: async ({
      item,
      to,
      waitingReason,
    }: {
      item: WorkItem;
      to: WorkItemStatus;
      waitingReason?: string;
    }) => {
      const doingCount = countDoing(items);
      const result = canTransition(item.status, to, { doingCount, waitingReason });
      if (!result.ok) throw Object.assign(new Error(result.reason), { blocked: result.reason });

      const patch: Partial<WorkItem> = { status: to };
      if (to === 'waiting' && waitingReason) patch.waiting_reason = waitingReason;
      if (to !== 'waiting') patch.waiting_reason = null;
      if (to === 'done' || to === 'cancelled') {
        patch.completed_at = new Date().toISOString();
        patch.remind_at    = null;
        patch.notified_at  = null;
      }
      if (to === 'doing' && !item.started_at) patch.started_at = new Date().toISOString();
      if (item.status === 'done' && to === 'todo')  patch.completed_at = null;

      const { error } = await supabase.from('conversation_tasks').update(patch).eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (err: Error & { blocked?: string }) => {
      if (err.blocked === 'wip_full')
        toast.error('Limite de Fazendo atingido (máx. 3). Conclua ou mova um item antes.');
      else if (err.blocked === 'waiting_reason_required')
        toast.error('Escreva o motivo da espera antes de mover.');
      else
        toast.error('Erro ao mover tarefa');
    },
  });

  // reorder (posição manual dentro da coluna)
  const reorderMutation = useMutation({
    mutationFn: async (positions: Array<{ id: string; position: number }>) => {
      for (const p of positions) {
        await supabase.from('conversation_tasks').update({ position: p.position }).eq('id', p.id);
      }
    },
    onSuccess: () => invalidate(),
  });

  // complete com undo
  const complete = async (item: WorkItem) => {
    await moveMutation.mutateAsync({ item, to: 'done' });
    undoToast({
      message: 'Tarefa concluída',
      onUndo: async () => {
        await moveMutation.mutateAsync({ item: { ...item, status: 'done' }, to: 'todo' });
      },
    });
  };

  // reopen
  const reopen = async (item: WorkItem) => {
    await moveMutation.mutateAsync({ item: { ...item, status: 'done' }, to: 'todo' });
  };

  // delete com undo (soft: cancela em vez de apagar)
  const deleteItem = async (item: WorkItem) => {
    const { error } = await supabase
      .from('conversation_tasks')
      .update({ status: 'cancelled' })
      .eq('id', item.id);
    if (error) { toast.error('Erro ao remover tarefa'); return; }
    invalidate();
    undoToast({
      message: 'Tarefa removida',
      onUndo: async () => {
        await supabase.from('conversation_tasks').update({ status: item.status }).eq('id', item.id);
        invalidate();
      },
    });
  };

  // ---- Dados derivados (memoizados) ----------------------------------------
  const byDue    = useMemo(() => bucketByDue(items), [items]);
  const byStatus = useMemo(() => bucketByStatus(items), [items]);
  const kpiData  = useMemo(() => kpis(items), [items]);

  return {
    items,
    isLoading,
    isError,
    refetch,
    // buckets
    byDue,
    byStatus,
    kpis: kpiData,
    // mutations
    create:   (input: WorkItemInput) => createMutation.mutateAsync(input),
    update:   (id: string, patch: Partial<WorkItemInput>) => updateMutation.mutateAsync({ id, patch }),
    move:     (item: WorkItem, to: WorkItemStatus, waitingReason?: string) =>
                moveMutation.mutateAsync({ item, to, waitingReason }),
    reorder:  (positions: Array<{ id: string; position: number }>) =>
                reorderMutation.mutateAsync(positions),
    complete,
    reopen,
    deleteItem,
    isCreating: createMutation.isPending,
    isMoving:   moveMutation.isPending,
    // flags
    hasMounted: hasMountedRef,
  };
}

// ---------------------------------------------------------------------------
// Adaptador de compatibilidade — useMyTasks legado chama este hook
// ---------------------------------------------------------------------------
/** @deprecated use useMyWorkItems */
// Adaptador de compat: useMyTasks = useMyWorkItems (re-exportado em useMyTasks.ts)

// ---------------------------------------------------------------------------
// Badge hook (leve — só conta overdue + alarmes vencidos não dispensados)
// ---------------------------------------------------------------------------
export function useMyWorkItemsBadge(): number {
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';

  const { data = 0 } = useQuery({
    queryKey: ['work-items-badge', profileId],
    queryFn: async (): Promise<number> => {
      if (!profileId) return 0;
      const now = new Date().toISOString();
      // Atrasadas
      const { count: overdue } = await supabase
        .from('conversation_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', profileId)
        .not('status', 'in', '("done","cancelled")')
        .lt('due_date', now);
      // Alarmes vencidos não dispensados
      const { count: alarms } = await supabase
        .from('conversation_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', profileId)
        .not('status', 'in', '("done","cancelled")')
        .lte('remind_at', now)
        .is('notified_at', null);
      return (overdue ?? 0) + (alarms ?? 0);
    },
    enabled: !!profileId,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  return data;
}
