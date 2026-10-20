/**
 * useMyWorkItems — hook unico das tarefas pessoais do usuario.
 *
 * ---------------------------------------------------------------------------
 * API PUBLICA (etapa 18)
 * ---------------------------------------------------------------------------
 *   const {
 *     items, isLoading, isError, refetch,   // estado da query
 *     byDue, byStatus, kpis,                // derivados (memoizados)
 *     create, update, move, reorder,        // mutations (todas otimistas)
 *     complete, reopen, cancel, deleteItem, // atalhos de fluxo
 *     snooze, setReminder,                  // alarme
 *     isCreating, isMoving,                 // flags de pending
 *   } = useMyWorkItems({ contactId?, includeCancelled? });
 *
 * Regras que valem para quem consome:
 *  - `move(item, to, { index?, waitingReason? })`. Quando `index` vem, a ordem
 *    das colunas de origem e destino e recalculada e gravada num unico upsert em
 *    lote (etapa 15); sem `index` so o status muda.
 *  - `snooze(item, minutes | 'tomorrow9')` e `setReminder(item, iso | null)`
 *    zeram `notified_at` (o alarme volta a poder disparar). Horario no passado
 *    alem da tolerancia de 60s lanca `Error` com `blocked: 'remind_in_past'`.
 *  - Toda mutation e otimista: `onMutate` aplica no cache, `onError` restaura o
 *    valor anterior e avisa, `onSettled` invalida (etapa 14).
 *  - A query key NAO inclui `includeDone` (B13): Lista, Quadro e Agenda
 *    compartilham a MESMA query, entao trocar de modo nao dispara request.
 *    `done` vem sempre dos ultimos 30 dias e o recorte de 7 dias e local
 *    (`bucketByDue`); `cancelled` so entra com `includeCancelled`.
 *  - `deleteItem` e alias de `cancel` (decisao D8): cancelar tem undo.
 *  - `hasMounted` nao faz parte da API: a flag de animacao de entrada vive em
 *    `TasksModule` (etapa 18).
 */
import { useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { undoToast } from '@/lib/undoToast';
import { fetchAllRows, type PageResult } from '@/lib/fetchAllRows';
import { secureRandomFloat } from '../../lib/secureRandom';
import { useAuth } from '@/hooks/auth/useAuth';
import {
  canTransition,
  applyTransition,
  countDoing,
} from './workItemMachine';
import { bucketByDue, bucketByStatus, kpis } from './workItemAggregates';
import type { WorkItem, WorkItemStatus, Priority, WorkItemContact } from './workItem.types';

export type { WorkItemContact };
import type { Database } from '@/integrations/supabase/types';

// Tipos gerados do banco: as colunas de conversation_tasks vivem em
// src/integrations/supabase/types.ts. Nada de tipo frouxo — era o que
// quebrava o typecheck-ratchet (B14/B15).
type TaskInsert = Database['public']['Tables']['conversation_tasks']['Insert'];
type TaskUpdate = Database['public']['Tables']['conversation_tasks']['Update'];
type TaskRow = Database['public']['Tables']['conversation_tasks']['Row'];

/** Linha do banco com o contato embutido (`contact:contacts!fkey(...)`). */
type TaskRowWithContact = TaskRow & { contact?: WorkItemContact | null };

/** Colunas que o badge le (R2-MOD-054: contagem no cliente sobre a leitura completa). */
type BadgeRow = Pick<TaskRow, 'id' | 'due_date' | 'remind_at' | 'notified_at' | 'status'>;

/** Janela de `done` que a query sempre traz (B13); o recorte de 7d e local. */
export const DONE_WINDOW_DAYS = 30;
/** Tolerancia para `remind_at` no passado (etapa 17). */
export const REMIND_PAST_TOLERANCE_MS = 60_000;

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
// Sem `includeDone` de proposito (B13): e o que faz Lista/Quadro/Agenda
// compartilharem cache e nao refazerem request na troca de modo.
export const workItemsKey = (
  profileId: string,
  opts?: { contactId?: string; includeCancelled?: boolean },
) =>
  [
    'work-items',
    profileId,
    opts?.contactId ?? 'all',
    opts?.includeCancelled ? 'with-cancelled' : 'active',
  ] as const;

export const workItemsBadgeKey = (profileId: string) =>
  ['work-items-badge', profileId] as const;

// ---------------------------------------------------------------------------
// Options e entrada
// ---------------------------------------------------------------------------
interface UseMyWorkItemsOpts {
  /** Quando informado, limita aos itens do contato (aba Tarefas do chat). */
  contactId?: string;
  /** Inclui cancelados (somente filtro "Canceladas"). */
  includeCancelled?: boolean;
}

export interface WorkItemInput {
  title: string;
  description?: string | null;
  contactId?: string | null;
  priority?: Priority;
  dueDate?: string | null;
  remindAt?: string | null;
  status?: WorkItemStatus;
  waitingReason?: string | null;
  /**
   * IA-047 — chave idempotente do clique (uuid estável). Derivada UMA vez por
   * ação na borda (ex.: sugestão de IA) e reusada num duplo submit/retry: o
   * índice único parcial (created_by, client_task_id) garante que o mesmo
   * pedido não cria duas tarefas. Sem ela o hook gera um uuid por chamada.
   */
  clientTaskId?: string | null;
}

export interface MoveOpts {
  /** Posicao de destino (drag & drop). Persiste a ordem das duas colunas. */
  index?: number;
  /** Motivo obrigatorio ao mover para `waiting`. */
  waitingReason?: string;
}

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------
/** Lanca `remind_in_past` quando o horario ja passou (etapa 17). */
export function assertRemindNotInPast(iso: string | null | undefined, now: Date = new Date()): void {
  if (!iso) return;
  if (new Date(iso).getTime() < now.getTime() - REMIND_PAST_TOLERANCE_MS) {
    throw Object.assign(new Error('remind_in_past'), { blocked: 'remind_in_past' });
  }
}

/** Amanha as 09:00 no fuso local (etapa 16). */
export function tomorrowAtNine(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

/**
 * UUID da chave idempotente do clique (IA-047). Usa o `crypto` do runtime; se
 * ele faltar, devolve `null` — o insert segue sem chave em vez de quebrar a
 * criação (o índice parcial simplesmente não cobre a linha).
 */
export function generateClientTaskId(): string | null {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return typeof c?.randomUUID === 'function' ? c.randomUUID() : null;
}

/** Patch de `update` no vocabulario do banco (sem `status`: quem move e `move`). */
function toDbPatch(patch: Partial<WorkItemInput>): TaskUpdate {
  const out: TaskUpdate = {};
  if (patch.title !== undefined)         out.title = patch.title;
  if (patch.description !== undefined)   out.description = patch.description;
  if (patch.priority !== undefined)      out.priority = patch.priority;
  if (patch.dueDate !== undefined)       out.due_date = patch.dueDate;
  if (patch.remindAt !== undefined)      out.remind_at = patch.remindAt;
  if (patch.waitingReason !== undefined) out.waiting_reason = patch.waitingReason;
  return out;
}

/** Patch equivalente no tipo do front (para o update otimista). */
function toItemPatch(patch: Partial<WorkItemInput>): Partial<WorkItem> {
  const out: Partial<WorkItem> = {};
  if (patch.title !== undefined)         out.title = patch.title;
  if (patch.description !== undefined)   out.description = patch.description;
  if (patch.priority !== undefined)      out.priority = patch.priority;
  if (patch.dueDate !== undefined)       out.due_date = patch.dueDate;
  if (patch.remindAt !== undefined)      out.remind_at = patch.remindAt;
  if (patch.waitingReason !== undefined) out.waiting_reason = patch.waitingReason;
  return out;
}

/** Converte a linha (com contato embutido) no WorkItem do front (etapa 13). */
function toWorkItem(row: TaskRowWithContact): WorkItem {
  const { contact, ...rest } = row;
  return {
    ...rest,
    status: rest.status as WorkItemStatus,
    priority: rest.priority as Priority,
    // A coluna e nullable, mas o trigger do banco mantem assigned_to = created_by.
    assigned_to: rest.assigned_to ?? rest.created_by,
    contact: contact ?? null,
  };
}

// ---------------------------------------------------------------------------
// Hook principal
// ---------------------------------------------------------------------------
export function useMyWorkItems(opts: UseMyWorkItemsOpts = {}) {
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';
  const queryClient = useQueryClient();
  const key = workItemsKey(profileId, opts);

  // ---- Query ---------------------------------------------------------------
  const { data: items = [], isLoading, isError, refetch } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<WorkItem[]> => {
      if (!profileId) return [];
      const cutoff = new Date(Date.now() - DONE_WINDOW_DAYS * 86_400_000).toISOString();
      // Construtor da consulta-base: uma vez por pagina (`.range()` muta o
      // builder, entao cada pagina precisa do proprio filtro).
      const base = () => {
        let q = supabase
          .from('conversation_tasks')
          .select('*, contact:contacts!conversation_tasks_contact_id_fkey(id,name,phone,avatar_url)')
          .eq('created_by', profileId)   // RLS tambem filtra, mas explicito e mais rapido
          // B13: done so dos ultimos 30 dias; cancelled tratado logo abaixo.
          // `completed_at.is.null` cobre linhas `done` legadas sem carimbo de
          // conclusao (o trigger de estado so grava em UPDATE e o backfill de
          // reminders inseriu `done` direto); sem isso ficariam invisiveis.
          .or(`status.neq.done,completed_at.is.null,completed_at.gte.${cutoff}`)
          .order('position', { ascending: true })
          .order('created_at', { ascending: false })
          // R2-MOD-054 — desempate unico para a paginacao ser estavel: sem uma
          // chave unica no fim da ordenacao, linhas com mesma `position` e mesmo
          // `created_at` podem repetir (ou pular) na virada de pagina.
          .order('id', { ascending: true });

        if (opts.contactId) q = q.eq('contact_id', opts.contactId);
        if (!opts.includeCancelled) q = q.not('status', 'eq', 'cancelled');
        return q;
      };

      // R2-MOD-054 — leitura PAGINADA. Um `select` sem `range` devolve so a
      // primeira pagina do PostgREST (teto do projeto: 1000 linhas). Busca,
      // filtros, KPIs, deep link e a contagem real do cabecalho derivam TODOS
      // deste array: o que passava do teto sumia em silencio. `fetchAllRows`
      // percorre a fonte inteira por paginas e diz se a leitura ficou incompleta.
      const { rows, incomplete, error } = await fetchAllRows<TaskRowWithContact>(
        (from, to) => base().range(from, to) as unknown as PromiseLike<PageResult<TaskRowWithContact>>,
      );
      if (error) throw new Error(error.message);
      // Nunca tratar leitura parcial como lista completa: sem isto, um teto de
      // paginas ainda devolveria um lote truncado como se fosse o universo.
      if (incomplete) throw new Error('Leitura de conversation_tasks incompleta');
      return rows.map(toWorkItem);
    },
    enabled: !!profileId,
    staleTime: 30_000,
  });

  // ---- Realtime ------------------------------------------------------------
  useEffect(() => {
    if (!profileId) return;
    // Nome UNICO por instancia. `RealtimeClient.channel(topic)` devolve o canal
    // EXISTENTE quando o topico se repete, e `.on()` depois de `subscribe()`
    // lanca. Com duas instancias vivas na mesma pagina (ex.: `ChatPanel` +
    // aba Tarefas do inbox, que chamam `useMyWorkItems` com o mesmo `profileId`)
    // a segunda derrubava a aba com "cannot add `postgres_changes` callbacks ...
    // after `subscribe()`". O sufixo aleatorio da um canal por montagem.
    // O topico e opaco: nao e gravado, comparado por regex nem enviado ao banco
    // (so ao Realtime, como nome de canal) — a fonte deixa de ser o PRNG
    // previsivel (S2245) e a expressao segue identica.
    const channel = supabase
      .channel(`work-items:${profileId}:${secureRandomFloat().toString(36).slice(2)}`)
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
          // B6: o badge conta o mesmo dado, entao cai junto no mesmo canal.
          queryClient.invalidateQueries({ queryKey: ['work-items-badge', profileId] });
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [profileId, queryClient]);

  // ---- Infra de mutation otimista (etapa 14) -------------------------------
  const listKey: QueryKey = ['work-items', profileId];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: listKey });
    queryClient.invalidateQueries({ queryKey: ['work-items-badge', profileId] });
  };

  /** Cancela as queries da lista e guarda o cache anterior de todas elas. */
  const beginOptimistic = async () => {
    await queryClient.cancelQueries({ queryKey: listKey });
    return queryClient.getQueriesData<WorkItem[]>({ queryKey: listKey });
  };

  /** Aplica uma transformacao em TODAS as listas em cache do usuario. */
  const patchCache = (updater: (items: WorkItem[]) => WorkItem[]) => {
    queryClient.setQueriesData<WorkItem[]>({ queryKey: listKey }, (old) =>
      old ? updater(old) : old
    );
  };

  /** Restaura exatamente o que existia antes. */
  const rollback = (snapshot: Array<[QueryKey, WorkItem[] | undefined]>) => {
    for (const [k, v] of snapshot) {
      if (v !== undefined) queryClient.setQueryData(k, v);
    }
  };

  // create
  const createMutation = useMutation({
    mutationFn: async (input: WorkItemInput) => {
      assertRemindNotInPast(input.remindAt);
      // Item novo entra no topo da coluna (etapa 15): position = min(coluna) - 1.
      const targetStatus = input.status ?? 'backlog';
      const posicoes = items.filter((i) => i.status === targetStatus).map((i) => i.position);
      const position = posicoes.length ? Math.min(...posicoes) - 1 : 0;
      // IA-047: o INSERT sempre carrega a chave idempotente do clique. Com a
      // chave explícita, repetir o mesmo pedido cai no índice único parcial
      // (created_by, client_task_id); sem chave (chamador antigo), geramos uma
      // agora para não deixar a coluna nula em cotações novas.
      const clientTaskId = input.clientTaskId ?? generateClientTaskId();
      // A coluna client_task_id (IA-047) ainda não existe nos tipos gerados e o
      // insert do supabase-js recusa propriedade excedente — cast de transporte
      // (mesmo idioma do outbound-message.service para tipos ainda não gerados).
      const row = {
        title: input.title,
        description: input.description ?? null,
        contact_id: input.contactId ?? null,
        created_by: profileId,
        assigned_to: profileId,           // sempre = created_by
        priority: input.priority ?? 'medium',
        status: targetStatus,
        position,
        due_date: input.dueDate ?? null,
        remind_at: input.remindAt ?? null,
        waiting_reason: input.waitingReason ?? null,
        client_task_id: clientTaskId,
      } as unknown as TaskInsert;
      // Devolve o id: quem cria fora do modulo precisa dele para abrir o item
      // (o /remind da fase F abria o Sheet e fazia uma leitura extra so para isso).
      const { data, error } = await supabase.from('conversation_tasks').insert(row).select('id').single();
      if (error) {
        // 23505 = violação da chave única (created_by, client_task_id): a tarefa
        // JÁ existe. O pedido é idempotente — não é erro para o usuário.
        if ((error as { code?: string }).code === '23505') return null;
        throw error;
      }
      return (data as { id: string } | null)?.id ?? null;
    },
    onSettled: () => invalidate(),
    onSuccess: () => { toast.success('Tarefa criada'); },
    onError: (err: Error & { blocked?: string }) => {
      if (err.blocked === 'remind_in_past') toast.error('O horario do aviso ja passou');
      else toast.error('Erro ao criar tarefa');
    },
  });

  /**
   * IA-047 — dedupe do duplo submit. Duas chamadas de criação com a MESMA
   * `clientTaskId` (dois cliques antes de a primeira resolver) compartilham a
   * mesma promise: só o primeiro insert sai. Sem chave, cada chamada é uma
   * intenção nova. Após resolver/falhar, a chave é liberada (um clique
   * deliberado mais tarde é de novo um novo caminho — e, ainda assim, a
   * constraint do banco barra um segundo INSERT com a mesma chave).
   */
  const inFlightCreates = useRef<Map<string, Promise<string | null>>>(new Map());
  const createOnce = useCallback(
    (input: WorkItemInput): Promise<string | null> => {
      const key = input.clientTaskId ?? null;
      if (key) {
        const emVoo = inFlightCreates.current.get(key);
        if (emVoo) return emVoo;
      }
      const promise = createMutation.mutateAsync(input).finally(() => {
        if (key) inFlightCreates.current.delete(key);
      });
      if (key) inFlightCreates.current.set(key, promise);
      return promise;
    },
    [createMutation],
  );

  // update (otimista)
  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<WorkItemInput> }) => {
      if (patch.remindAt !== undefined) assertRemindNotInPast(patch.remindAt);
      const { error } = await supabase
        .from('conversation_tasks')
        .update(toDbPatch(patch))
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, patch }) => {
      const snapshot = await beginOptimistic();
      const itemPatch = toItemPatch(patch);
      patchCache((list) => list.map((i) => (i.id === id ? { ...i, ...itemPatch } : i)));
      return { snapshot };
    },
    onError: (err: Error & { blocked?: string }, _vars, ctx) => {
      if (ctx) rollback(ctx.snapshot);
      if (err.blocked === 'remind_in_past') toast.error('O horario do aviso ja passou');
      else toast.error('Erro ao atualizar tarefa');
    },
    onSettled: () => invalidate(),
  });

  /** Persiste a ordem das colunas de origem e destino num unico upsert (etapa 15). */
  const persistPositions = async (item: WorkItem, to: WorkItemStatus, index: number) => {
    // Derivado localmente (e nao do memo `byStatus`): manter o memo puro e o que
    // o react-compiler exige para preservar a memorizacao.
    const cols = bucketByStatus(items);
    const target = (cols[to] ?? []).filter((i) => i.id !== item.id);
    target.splice(Math.max(0, Math.min(index, target.length)), 0, { ...item, status: to });
    const source = (cols[item.status] ?? []).filter((i) => i.id !== item.id);

    // `created_by` e `title` sao NOT NULL sem default no banco: o upsert precisa
    // leva-los para a linha nao esbarrar em not-null.
    const rows = [
      ...target.map((it, idx) => ({ id: it.id, position: idx, title: it.title, created_by: it.created_by || profileId })),
      ...source.map((it, idx) => ({ id: it.id, position: idx, title: it.title, created_by: it.created_by || profileId })),
    ];
    const { error } = await supabase
      .from('conversation_tasks')
      .upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  };

  // move (transicao de status, otimista)
  const moveMutation = useMutation({
    mutationFn: async ({ item, to, opts: moveOpts }: { item: WorkItem; to: WorkItemStatus; opts?: MoveOpts }) => {
      const doingCount = countDoing(items);
      const result = canTransition(item.status, to, {
        doingCount,
        waitingReason: moveOpts?.waitingReason,
      });
      if (!result.ok) throw Object.assign(new Error(result.reason), { blocked: result.reason });

      const patch: TaskUpdate = { status: to };
      if (to === 'waiting' && moveOpts?.waitingReason) patch.waiting_reason = moveOpts.waitingReason;
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

      if (moveOpts?.index !== undefined && item.status !== to) {
        await persistPositions(item, to, moveOpts.index);
      }
    },
    onMutate: async ({ item, to, opts: moveOpts }) => {
      const snapshot = await beginOptimistic();
      patchCache((list) =>
        list.map((i) =>
          i.id === item.id
            ? {
                ...applyTransition(i, to),
                ...(to === 'waiting' && moveOpts?.waitingReason ? { waiting_reason: moveOpts.waitingReason } : {}),
                ...(moveOpts?.index !== undefined ? { position: moveOpts.index } : {}),
              }
            : i
        )
      );
      return { snapshot };
    },
    onError: (err: Error & { blocked?: string }, _vars, ctx) => {
      if (ctx) rollback(ctx.snapshot);
      if (err.blocked === 'wip_full')
        toast.error('Limite de Fazendo atingido (max. 3). Conclua ou mova um item antes.');
      else if (err.blocked === 'waiting_reason_required')
        toast.error('Escreva o motivo da espera antes de mover.');
      else
        toast.error('Erro ao mover tarefa');
    },
    onSettled: () => invalidate(),
  });

  // reorder (posicao manual dentro da coluna)
  const reorderMutation = useMutation({
    mutationFn: async (positions: Array<{ id: string; position: number }>) => {
      const byId = new Map(items.map((i) => [i.id, i]));
      const rows = positions
        .map((p) => {
          const it = byId.get(p.id);
          return it
            ? { id: p.id, position: p.position, title: it.title, created_by: it.created_by || profileId }
            : null;
        })
        .filter((r): r is { id: string; position: number; title: string; created_by: string } => r !== null);
      if (rows.length === 0) return;
      const { error } = await supabase.from('conversation_tasks').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    },
    onMutate: async (positions) => {
      const snapshot = await beginOptimistic();
      const posById = new Map(positions.map((p) => [p.id, p.position]));
      patchCache((list) =>
        list.map((i) => (posById.has(i.id) ? { ...i, position: posById.get(i.id)! } : i))
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) rollback(ctx.snapshot);
      toast.error('Erro ao reordenar tarefas');
    },
    onSettled: () => invalidate(),
  });

  /**
   * R2-MOD-053 — reverte cancelamento/conclusão ao snapshot capturado ANTES da
   * ação. O trigger do banco zera `remind_at`/`notified_at` ao entrar em
   * done/cancelled (20260928140000_tasks_unify_reminders_kanban.sql) e o patch de
   * cancel/complete não os repõe; por isso o undo reescreve status, completed_at
   * E o alarme a partir do item original. A escrita é conferida: erro do
   * PostgREST/RLS E 0 linhas contam como falha (o RLS filtra sem lançar), então
   * quem diz "Ação desfeita" só confirma depois deste await resolver.
   */
  const restoreSnapshot = async (item: WorkItem) => {
    const { data, error } = await supabase
      .from('conversation_tasks')
      .update({
        status: item.status,
        completed_at: item.completed_at,
        remind_at: item.remind_at,
        notified_at: item.notified_at,
      })
      .eq('id', item.id)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('undo_no_rows');
    invalidate();
  };

  /** Cancelamento (D8): soft, com undo. `deleteItem` e alias disto. */
  const cancelMutation = useMutation({
    mutationFn: async (item: WorkItem) => {
      const { error } = await supabase
        .from('conversation_tasks')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('id', item.id);
      if (error) throw error;
    },
    onMutate: async (item) => {
      const snapshot = await beginOptimistic();
      patchCache((list) => list.map((i) => (i.id === item.id ? applyTransition(i, 'cancelled') : i)));
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) rollback(ctx.snapshot);
      toast.error('Erro ao remover tarefa');
    },
    onSettled: () => invalidate(),
  });

  const cancel = async (item: WorkItem) => {
    await cancelMutation.mutateAsync(item);
    undoToast({
      message: 'Tarefa removida',
      onUndo: () => restoreSnapshot(item),
    });
  };

  // complete com undo
  const complete = async (item: WorkItem) => {
    await moveMutation.mutateAsync({ item, to: 'done' });
    undoToast({
      message: 'Tarefa concluida',
      // Desfazer devolve ao estado EXATO de antes (todo/doing/waiting) e rearma
      // o alarme — antes forçava 'todo' e perdia o lembrete.
      onUndo: () => restoreSnapshot(item),
    });
  };

  // reopen
  const reopen = async (item: WorkItem) => {
    await moveMutation.mutateAsync({ item: { ...item, status: 'done' }, to: 'todo' });
  };

  /** Adia o aviso (etapa 16): `remind_at` novo e `notified_at` zerado. */
  const snooze = async (item: WorkItem, minutes: number | 'tomorrow9') => {
    const when = minutes === 'tomorrow9'
      ? tomorrowAtNine()
      : new Date(Date.now() + Math.max(1, minutes) * 60_000);
    const { error } = await supabase
      .from('conversation_tasks')
      .update({ remind_at: when.toISOString(), notified_at: null })
      .eq('id', item.id);
    if (error) { toast.error('Erro ao adiar o aviso'); return; }
    invalidate();
    toast.success(minutes === 'tomorrow9' ? 'Aviso adiado para amanha, 9h' : 'Aviso adiado');
  };

  /** Define (iso) ou remove (null) o alarme (etapa 17). */
  const setReminder = async (item: WorkItem, iso: string | null) => {
    try {
      assertRemindNotInPast(iso);
    } catch (err) {
      toast.error('O horario do aviso ja passou');
      throw err;
    }
    const { error } = await supabase
      .from('conversation_tasks')
      .update({ remind_at: iso, notified_at: null })
      .eq('id', item.id);
    if (error) { toast.error('Erro ao definir o aviso'); return; }
    invalidate();
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
    // `create` segue devolvendo void (varios consumidores tipam assim); quem precisa
    // do id da tarefa criada usa `createAndGetId` (fase F: o /remind abre o item).
    // IA-047: as duas passam por `createOnce`, que deduplica pelo `clientTaskId`.
    create:   async (input: WorkItemInput) => { await createOnce(input); },
    createAndGetId: (input: WorkItemInput) => createOnce(input),
    update:   (id: string, patch: Partial<WorkItemInput>) => updateMutation.mutateAsync({ id, patch }),
    move:     (item: WorkItem, to: WorkItemStatus, opts?: MoveOpts) =>
                moveMutation.mutateAsync({ item, to, opts }),
    reorder:  (positions: Array<{ id: string; position: number }>) =>
                reorderMutation.mutateAsync(positions),
    complete,
    reopen,
    cancel,
    deleteItem: cancel,          // alias (D8)
    snooze,
    setReminder,
    isCreating: createMutation.isPending,
    isMoving:   moveMutation.isPending,
  };
}

// ---------------------------------------------------------------------------
// Adaptador de compatibilidade — useMyTasks legado chama este hook
// ---------------------------------------------------------------------------
/** @deprecated use useMyWorkItems */
// Adaptador de compat: useMyTasks = useMyWorkItems (re-exportado em useMyTasks.ts)

// ---------------------------------------------------------------------------
// Badge (B6) — atrasadas + avisos ja avisados e nao tratados
// ---------------------------------------------------------------------------
const EMPTY_BADGE_INFO = { count: 0, hasOverdue: false } as const;

export interface WorkItemsBadgeInfo {
  /** Atrasadas + avisos ja disparados e nao tratados (mesma regra do badge). */
  count: number;
  /** Ha alguma tarefa com prazo vencido? Decide a COR do badge (etapa 62). */
  hasOverdue: boolean;
}

/** Badge do item Tarefas com a informacao de cor (etapa 62). */
export function useMyWorkItemsBadgeInfo(): WorkItemsBadgeInfo {
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';

  const { data = EMPTY_BADGE_INFO } = useQuery({
    queryKey: [...workItemsBadgeKey(profileId), 'info'] as const,
    queryFn: async (): Promise<WorkItemsBadgeInfo> => {
      if (!profileId) return EMPTY_BADGE_INFO;
      const now = Date.now();
      // R2-MOD-054 — o badge paga o MESMO teto do PostgREST: uma unica resposta
      // cortava a contagem em 1000 linhas e o numero (e a cor) do item saiam
      // sobre um lote parcial. A contagem segue no cliente, mas sobre a leitura
      // COMPLETA (`fetchAllRows`), com `id` de desempate para a paginacao.
      const { rows, incomplete, error } = await fetchAllRows<BadgeRow>(
        (from, to) => supabase
          .from('conversation_tasks')
          .select('id,due_date,remind_at,notified_at,status')
          .eq('created_by', profileId)
          .not('status', 'in', '("done","cancelled")')
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<PageResult<BadgeRow>>,
      );
      if (error) throw new Error(error.message);
      // Leitura parcial nunca vira "total": se nao cobriu tudo, e erro.
      if (incomplete) throw new Error('Leitura de conversation_tasks incompleta (badge)');

      // Atrasadas: prazo vencido.
      const overdue = rows.filter((r) => r.due_date != null && new Date(r.due_date).getTime() < now).length;
      // Avisado e nao tratado: o alarme ja disparou (notified_at preenchido).
      const fired = rows.filter(
        (r) => r.remind_at != null && new Date(r.remind_at).getTime() <= now && r.notified_at != null
      ).length;
      return { count: overdue + fired, hasOverdue: overdue > 0 };
    },
    enabled: !!profileId,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  return data;
}

/** Compat: consumidores que so precisam do numero (comportamento anterior). */
export function useMyWorkItemsBadge(): number {
  return useMyWorkItemsBadgeInfo().count;
}
