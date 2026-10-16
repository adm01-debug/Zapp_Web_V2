import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { localDayKey } from '@/lib/localDay';
import { RESULT_LABEL, toResult } from '@/lib/calls/callStatus';
import { rotulosDoEncerramento } from '@/lib/journey/mappers';
import { startOfDay, subDays } from 'date-fns';

export type TimelineEventKind =
  | 'message_in' | 'message_out' | 'note' | 'transfer' | 'assign' | 'file' | 'task' | 'deal' | 'close' | 'reopen' | 'call';

export type TimelineTypeFilter = 'all' | 'messages' | 'notes' | 'tasks' | 'transfers' | 'files' | 'deals' | 'calls';

export interface TimelineEvent {
  id: string;
  at: string;
  kind: TimelineEventKind;
  title: string;
  subtitle?: string;
  pill?: { label: string; tone: 'success' | 'warning' | 'primary' | 'muted' | 'destructive' };
  count?: number;
  /** Nota escrita na transferência (`conversation_events.metadata.note`), cortada em 120. */
  note?: string;
  /** A mesma nota SEM corte — para o detalhe do episódio. */
  noteFull?: string;
}

export interface TimelineDay {
  date: string; // yyyy-MM-dd
  events: TimelineEvent[];
}

export interface TimelineMetrics {
  total: number;
  lastContactAt: string | null;
  avgResponseMin: number | null;
  avgResponsePrevMin: number | null;
  resolutions: number;
}

export interface RawMessageRow {
  id: string;
  sender: string;
  content: string | null;
  media_url: string | null;
  media_filename: string | null;
  media_size: number | null;
  created_at: string;
}

export interface RawEventRow {
  id: string;
  event_type: string;
  created_at: string;
  /**
   * `conversation_events.metadata` (jsonb). A transferência grava a nota do atendente em
   * `metadata.note`; mapa aberto porque a coluna é jsonb.
   */
  metadata?: Record<string, unknown> | null;
  /**
   * Nomes já resolvidos (agente/fila) para a linha "De → Para". O hook busca os nomes pelos ids
   * antes de montar a timeline; sem nome (RLS), o id fica no lugar — mesma decisão do mapeador.
   */
  from_agent_name?: string | null;
  to_agent_name?: string | null;
  from_queue_name?: string | null;
  to_queue_name?: string | null;
  /** Encerramento: motivo, resultado e classificação já em rótulo (`conversation_closures`). */
  closure_reason?: string | null;
  closure_outcome?: string | null;
  closure_classification?: string | null;
}

export interface RawNoteRow {
  id: string;
  content: string;
  created_at: string;
}

export interface RawTaskRow {
  id: string;
  title: string;
  status: string;
  /**
   * Carimbo de conclusão (`conversation_tasks.completed_at`). No modelo atual de tarefas
   * (WorkItem) a conclusão é gravada junto do status `done` — e linhas legadas podem
   * trazê-la com outro status. Opcional de propósito: as linhas antigas do banco e os
   * testes puros não precisam carregar o campo.
   */
  completed_at?: string | null;
  created_at: string;
}

export interface RawDealRow {
  id: string;
  title: string;
  value: number | null;
  status: string | null;
  created_at: string | null;
}

export interface RawActivityRow {
  id: string;
  description: string | null;
  activity_type: string;
  created_at: string | null;
}

/** Linha crua de `calls` — colunas reais conferidas em useCalls.ts/useCallHistory.ts. */
export interface RawCallRow {
  id: string;
  /** `inbound` = recebida · `outbound` = realizada (pode vir ausente em linha antiga). */
  direction: string | null;
  status: string;
  /** Instante da ligação (a tabela `calls` não tem `created_at` como data do evento). */
  started_at: string;
  duration_seconds: number | null;
  answered_at: string | null;
  ended_at: string | null;
}

export interface TimelineRawRows {
  messages: RawMessageRow[];
  events: RawEventRow[];
  notes: RawNoteRow[];
  tasks: RawTaskRow[];
  deals: RawDealRow[];
  activities: RawActivityRow[];
  /** Ligações do contato (`calls`). Opcional: os testes puros de buildTimeline não precisam dele. */
  calls?: RawCallRow[];
  /** mensagens da janela anterior (mesma duração), só para o delta de tempo médio de resposta. */
  previousMessages?: RawMessageRow[];
}

const TYPE_KINDS: Record<Exclude<TimelineTypeFilter, 'all'>, TimelineEventKind[]> = {
  messages: ['message_in', 'message_out'],
  notes: ['note'],
  tasks: ['task'],
  transfers: ['transfer', 'assign'],
  files: ['file'],
  deals: ['deal', 'close', 'reopen'],
  calls: ['call'],
};

const ASSIGN_TYPES = new Set(['assign', 'unassign']);
const TRANSFER_TYPES = new Set(['transfer', 'queue_transfer', 'overload_reassign', 'absence_reassign']);

function truncate(text: string | null | undefined, max = 120): string | undefined {
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Duração legível da ligação a partir de `calls.duration_seconds`.
 * Ausente/zero não rende texto (ligação perdida não tem duração a mostrar).
 */
function formatCallDuration(seconds: number | null | undefined): string | undefined {
  if (seconds == null || seconds <= 0) return undefined;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min === 0) return `${sec}s`;
  return sec === 0 ? `${min}min` : `${min}min ${sec}s`;
}

/**
 * Status de conclusão no banco: `done` é o do modelo atual de tarefas (WorkItemStatus);
 * `completed` fica por causa das linhas antigas gravadas antes da migração do modelo.
 */
const CONCLUDED_TASK_STATUSES = new Set(['done', 'completed']);

/**
 * Tarefa concluída quando o status é de conclusão OU quando há carimbo de conclusão
 * (`completed_at`). O carimbo vale mesmo se a linha trouxer um status legado diferente —
 * sem isso, tarefa já feita aparecia como "Pendente" no histórico da conversa.
 */
function isTaskConcluded(task: Pick<RawTaskRow, 'status' | 'completed_at'>): boolean {
  if (task.completed_at) return true;
  return CONCLUDED_TASK_STATUSES.has(task.status);
}

function averageResponseMinutes(messages: RawMessageRow[]): number | null {
  const sorted = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const deltas: number[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (current.sender === 'contact' && next.sender === 'agent') {
      const deltaMs = new Date(next.created_at).getTime() - new Date(current.created_at).getTime();
      if (deltaMs >= 0) deltas.push(deltaMs / 60000);
    }
  }
  if (!deltas.length) return null;
  return deltas.reduce((s, d) => s + d, 0) / deltas.length;
}

/** Agrupa mensagens consecutivas do mesmo remetente em ≤ burstMinutes num único evento. */
function buildMessageEvents(messages: RawMessageRow[], burstMinutes: number): TimelineEvent[] {
  const sorted = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const events: TimelineEvent[] = [];
  let burst: RawMessageRow[] = [];

  const flush = () => {
    if (!burst.length) return;
    const first = burst[0];
    const isFile = burst.every((m) => !!m.media_url) && burst.length === 1 && burst[0].media_url;
    const sender = first.sender === 'agent' ? 'enviadas' : 'recebidas';
    const kind: TimelineEventKind = isFile ? 'file' : first.sender === 'agent' ? 'message_out' : 'message_in';
    const title = isFile
      ? (first.media_filename || 'Arquivo enviado')
      : burst.length > 1
        ? `${burst.length} mensagens ${sender}`
        : (first.sender === 'agent' ? 'Mensagem enviada' : 'Mensagem recebida');
    events.push({
      id: `msg-${first.id}`,
      at: burst[burst.length - 1].created_at,
      kind,
      title,
      subtitle: isFile ? undefined : truncate(first.content),
      count: burst.length > 1 ? burst.length : undefined,
    });
    burst = [];
  };

  for (const msg of sorted) {
    const last = burst[burst.length - 1];
    if (!last) {
      burst.push(msg);
      continue;
    }
    const sameSender = last.sender === msg.sender;
    const withinWindow = (new Date(msg.created_at).getTime() - new Date(last.created_at).getTime()) <= burstMinutes * 60000;
    const bothPlainText = !last.media_url && !msg.media_url;
    if (sameSender && withinWindow && bothPlainText) {
      burst.push(msg);
    } else {
      flush();
      burst.push(msg);
    }
  }
  flush();
  return events;
}

function eventKindFor(eventType: string): TimelineEventKind | null {
  if (ASSIGN_TYPES.has(eventType)) return 'assign';
  if (TRANSFER_TYPES.has(eventType)) return 'transfer';
  if (eventType === 'close') return 'close';
  if (eventType === 'reopen') return 'reopen';
  return null;
}

/** Mesmo teto de corte do resto do app para a linha da timeline. */
const NOTA_MAX = 120;

/**
 * Nota escrita na transferência (`conversation_events.metadata.note`): devolve o texto cortado
 * em 120 (`curto`, para a linha) e o texto completo (`completo`, para o detalhe). Nota
 * vazia/ausente → `null`; sem nota, o evento sai exatamente como antes.
 */
function comentarioDoEvento(
  metadata: RawEventRow['metadata'],
): { curto: string; completo: string } | null {
  const bruto = metadata && typeof metadata['note'] === 'string' ? String(metadata['note']) : '';
  const completo = bruto.replace(/\s+/g, ' ').trim();
  if (!completo) return null;
  const curto = completo.length <= NOTA_MAX ? completo : `${completo.slice(0, NOTA_MAX).trimEnd()}…`;
  return { curto, completo };
}

/**
 * Linha de apoio do evento de conversa: transferência/atribuição mostram "De → Para" (com fila
 * quando não há agente); o encerramento mostra o que o atendente registrou no fechamento. Sem
 * dado nenhum, o subtítulo não é emitido (nada de linha vazia).
 */
function subtituloDoEvento(kind: TimelineEventKind, e: RawEventRow): string | undefined {
  if (kind === 'close') {
    const partes = [
      e.closure_reason ? `Motivo: ${e.closure_reason}` : null,
      e.closure_outcome ? `Resultado: ${e.closure_outcome}` : null,
      e.closure_classification ? `Classificação: ${e.closure_classification}` : null,
    ].filter((p): p is string => !!p);
    return partes.length ? partes.join(' · ') : undefined;
  }
  const de = e.from_agent_name ?? e.from_queue_name;
  const para = e.to_agent_name ?? e.to_queue_name;
  return de && para ? `De: ${de} · Para: ${para}` : undefined;
}

/** Une as fontes, agrupa rajadas de mensagens e ordena — função pura, testável sem rede. */
export function buildTimeline(
  rows: TimelineRawRows,
  opts: { type?: TimelineTypeFilter; burstMinutes?: number; limit?: number } = {},
): { days: TimelineDay[]; metrics: TimelineMetrics; hasMore: boolean } {
  const burstMinutes = opts.burstMinutes ?? 10;
  const limit = opts.limit ?? 200;
  const type = opts.type ?? 'all';

  const events: TimelineEvent[] = [
    ...buildMessageEvents(rows.messages, burstMinutes),
    ...rows.notes.map((n): TimelineEvent => ({
      id: `note-${n.id}`, at: n.created_at, kind: 'note', title: 'Nota adicionada', subtitle: truncate(n.content),
    })),
    ...rows.tasks.map((t): TimelineEvent => ({
      id: `task-${t.id}`, at: t.created_at, kind: 'task', title: `Tarefa criada: ${t.title}`,
      pill: isTaskConcluded(t) ? { label: 'Concluída', tone: 'success' } : { label: 'Pendente', tone: 'warning' },
    })),
    ...rows.deals
      .filter((d) => d.created_at)
      .map((d): TimelineEvent => ({
        id: `deal-${d.id}`, at: d.created_at as string, kind: 'deal', title: `Negociação criada: ${d.title}`,
        pill: d.status === 'won' ? { label: 'Ganho', tone: 'success' } : d.status === 'lost' ? { label: 'Perdido', tone: 'destructive' } : { label: 'Em aberto', tone: 'warning' },
      })),
    ...rows.activities
      .filter((a) => a.created_at)
      .map((a): TimelineEvent => ({
        id: `activity-${a.id}`, at: a.created_at as string, kind: 'deal', title: a.description || a.activity_type,
      })),
    ...rows.events
      .map((e) => ({ e, kind: eventKindFor(e.event_type) }))
      .filter((x): x is { e: RawEventRow; kind: TimelineEventKind } => x.kind !== null)
      .map(({ e, kind }): TimelineEvent => {
        const nota = comentarioDoEvento(e.metadata);
        return {
          id: `event-${e.id}`,
          at: e.created_at,
          kind,
          title: kind === 'transfer' ? 'Transferência' : kind === 'assign' ? 'Atribuição' : kind === 'close' ? 'Conversa encerrada' : 'Conversa reaberta',
          subtitle: subtituloDoEvento(kind, e),
          note: nota?.curto,
          noteFull: nota?.completo,
        };
      }),
    ...(rows.calls ?? []).map((c): TimelineEvent => {
      const result = toResult(c);
      const resultado = result ? RESULT_LABEL[result] : undefined;
      const duracao = formatCallDuration(c.duration_seconds);
      const subtitle = [resultado, duracao].filter((p): p is string => !!p).join(' · ');
      return {
        id: `call-${c.id}`,
        at: c.started_at,
        kind: 'call',
        title: c.direction === 'inbound' ? 'Chamada recebida' : c.direction === 'outbound' ? 'Chamada realizada' : 'Chamada',
        subtitle: subtitle || undefined,
      };
    }),
  ]
    .filter((e) => e.at)
    .sort((a, b) => b.at.localeCompare(a.at));

  const filtered = type === 'all' ? events : events.filter((e) => TYPE_KINDS[type].includes(e.kind));
  const hasMore = filtered.length > limit;
  const limited = filtered.slice(0, limit);

  const days = new Map<string, TimelineEvent[]>();
  for (const event of limited) {
    // Dia LOCAL do navegador (regra do produto): a fatia UTC do ISO jogaria 22:30 em Sao
    // Paulo para o dia seguinte, com o cabecalho do dia errado na timeline.
    const day = localDayKey(event.at);
    if (!day) continue;
    if (!days.has(day)) days.set(day, []);
    days.get(day)!.push(event);
  }

  const resolutions = rows.events.filter((e) => e.event_type === 'close').length;
  const lastContactAt = rows.messages.length
    ? [...rows.messages].sort((a, b) => b.created_at.localeCompare(a.created_at))[0].created_at
    : null;

  return {
    days: [...days.entries()].map(([date, dayEvents]) => ({ date, events: dayEvents })),
    metrics: {
      total: rows.messages.length + rows.events.length + rows.tasks.length + rows.notes.length + rows.deals.length + rows.activities.length + (rows.calls?.length ?? 0),
      lastContactAt,
      avgResponseMin: averageResponseMinutes(rows.messages),
      avgResponsePrevMin: rows.previousMessages ? averageResponseMinutes(rows.previousMessages) : null,
      resolutions,
    },
    hasMore,
  };
}

export const conversationHistoryKey = (contactId: string | null | undefined, period: number, type: TimelineTypeFilter, limit = 200) =>
  ['conversation-history', contactId, period, type, limit] as const;

export function useConversationHistoryTimeline(
  contactId: string | null | undefined,
  period: 7 | 30 | 90 | 0 = 30,
  type: TimelineTypeFilter = 'all',
  limit = 200,
) {
  return useQuery({
    queryKey: conversationHistoryKey(contactId, period, type, limit),
    queryFn: async () => {
      const cid = contactId as string;
      // 'Ultimos 7 dias' = 7 dias de CALENDARIO no fuso do navegador (dias 24..30 de 30/09),
      // nao 168 h para tras — que alcancavam 23/09 22:30 e entregavam 8 dias parciais.
      const sinceIso = period > 0 ? startOfDay(subDays(new Date(), period - 1)).toISOString() : null;

      // A janela de transporte acompanha o `limit` da UI, e não tetos fixos (antes: 500 mensagens
      // e 200 eventos). Pedimos uma linha a mais por fonte como sonda: se voltar mais que o `limit`,
      // existe registro no servidor além da amostra exibida — é isso que dirige o "Carregar mais".
      const fetchLimit = limit + 1;

      const messagesQuery = supabase
        .from('messages')
        .select('id, sender, content, media_url, media_filename, media_size, created_at')
        .eq('contact_id', cid)
        .order('created_at', { ascending: false })
        .limit(fetchLimit);
      const eventsQuery = supabase
        .from('conversation_events')
        .select('id, event_type, created_at, metadata, from_agent_id, to_agent_id, from_queue_id, to_queue_id, closure_id')
        .eq('contact_id', cid)
        .order('created_at', { ascending: false })
        .limit(fetchLimit);
      const notesQuery = supabase.from('contact_notes').select('id, content, created_at').eq('contact_id', cid).order('created_at', { ascending: false }).limit(fetchLimit);
      const tasksQuery = supabase.from('conversation_tasks').select('id, title, status, completed_at, created_at').eq('contact_id', cid).order('created_at', { ascending: false }).limit(fetchLimit);
      const dealsQuery = supabase.from('sales_deals').select('id, title, value, status, created_at').eq('contact_id', cid).order('created_at', { ascending: false }).limit(fetchLimit);
      const callsQuery = supabase.from('calls').select('id, direction, status, started_at, duration_seconds, answered_at, ended_at').eq('contact_id', cid).order('started_at', { ascending: false }).limit(fetchLimit);

      const [messagesRes, eventsRes, notesRes, tasksRes, dealsRes, callsRes] = await Promise.all([
        sinceIso ? messagesQuery.gte('created_at', sinceIso) : messagesQuery,
        sinceIso ? eventsQuery.gte('created_at', sinceIso) : eventsQuery,
        sinceIso ? notesQuery.gte('created_at', sinceIso) : notesQuery,
        sinceIso ? tasksQuery.gte('created_at', sinceIso) : tasksQuery,
        sinceIso ? dealsQuery.gte('created_at', sinceIso) : dealsQuery,
        sinceIso ? callsQuery.gte('started_at', sinceIso) : callsQuery,
      ]);
      if (messagesRes.error) throw messagesRes.error;
      if (eventsRes.error) throw eventsRes.error;
      if (notesRes.error) throw notesRes.error;
      if (tasksRes.error) throw tasksRes.error;
      if (dealsRes.error) throw dealsRes.error;
      if (callsRes.error) throw callsRes.error;

      const dealIds = (dealsRes.data ?? []).map((d) => d.id);
      const activitiesRes = dealIds.length
        ? await supabase.from('deal_activities').select('id, deal_id, description, activity_type, created_at').in('deal_id', dealIds).order('created_at', { ascending: false }).limit(fetchLimit)
        : { data: [] as RawActivityRow[], error: null };
      if (activitiesRes.error) throw activitiesRes.error;

      // O evento bruto só traz ids: sem resolver os nomes, "De → Para" nunca aparecia e o
      // encerramento ficava sem motivo/resultado. Consultamos só o que os eventos apontam —
      // contato sem transferência/encerramento não paga consulta nova.
      const eventos = eventsRes.data ?? [];
      const idsDe = (valores: Array<string | null>) => Array.from(new Set(valores.filter((v): v is string => !!v)));

      const agenteIds = idsDe(eventos.flatMap((e) => [e.from_agent_id, e.to_agent_id]));
      const filaIds = idsDe(eventos.flatMap((e) => [e.from_queue_id, e.to_queue_id]));
      const encerramentoIds = idsDe(eventos.map((e) => e.closure_id));

      const [agentesRes, filasRes, encerramentosRes] = await Promise.all([
        agenteIds.length
          ? supabase.from('profiles').select('id, name').in('id', agenteIds)
          : { data: [] as Array<{ id: string; name: string | null }>, error: null },
        filaIds.length
          ? supabase.from('queues').select('id, name').in('id', filaIds)
          : { data: [] as Array<{ id: string; name: string | null }>, error: null },
        encerramentoIds.length
          ? supabase.from('conversation_closures').select('id, close_reason, outcome, classification').in('id', encerramentoIds)
          : { data: [] as Array<{ id: string; close_reason: string | null; outcome: string | null; classification: string | null }>, error: null },
      ]);
      if (agentesRes.error) throw agentesRes.error;
      if (filasRes.error) throw filasRes.error;
      if (encerramentosRes.error) throw encerramentosRes.error;

      const nomeDeAgente = new Map<string, string | null>((agentesRes.data ?? []).map((p) => [p.id, p.name]));
      const nomeDeFila = new Map<string, string | null>((filasRes.data ?? []).map((q) => [q.id, q.name]));
      const encerramentos = encerramentosRes.data ?? [];
      const porId = new Map<string, { id: string; close_reason: string | null; outcome: string | null; classification: string | null }>();
      for (const c of encerramentos) porId.set(c.id, c);

      const eventosEnriquecidos: RawEventRow[] = eventos.map((e) => {
        const encerramento = e.closure_id ? porId.get(e.closure_id) : undefined;
        const rotulos = rotulosDoEncerramento(
          encerramento
            ? { closeReason: encerramento.close_reason, outcome: encerramento.outcome, classification: encerramento.classification }
            : null,
        );
        return {
          id: e.id,
          event_type: e.event_type,
          created_at: e.created_at,
          metadata: e.metadata as Record<string, unknown> | null,
          // Sem nome (RLS negou), o id fica no lugar — mesma decisão do mapeador da jornada.
          from_agent_name: e.from_agent_id ? nomeDeAgente.get(e.from_agent_id) ?? e.from_agent_id : null,
          to_agent_name: e.to_agent_id ? nomeDeAgente.get(e.to_agent_id) ?? e.to_agent_id : null,
          from_queue_name: e.from_queue_id ? nomeDeFila.get(e.from_queue_id) ?? e.from_queue_id : null,
          to_queue_name: e.to_queue_id ? nomeDeFila.get(e.to_queue_id) ?? e.to_queue_id : null,
          closure_reason: rotulos.motivo,
          closure_outcome: rotulos.resultado,
          closure_classification: rotulos.classificacao,
        };
      });

      // Truncamento real: alguma fonte devolveu mais linhas do que a tela mostra (pedimos limit+1).
      // Sem isto, hasMore sairia só do comprimento da amostra e o "Carregar mais" pararia na janela.
      const truncou =
        (messagesRes.data?.length ?? 0) > limit ||
        (eventsRes.data?.length ?? 0) > limit ||
        (notesRes.data?.length ?? 0) > limit ||
        (tasksRes.data?.length ?? 0) > limit ||
        (dealsRes.data?.length ?? 0) > limit ||
        (callsRes.data?.length ?? 0) > limit ||
        (activitiesRes.data?.length ?? 0) > limit;

      const timeline = buildTimeline(
        {
          messages: (messagesRes.data ?? []) as RawMessageRow[],
          events: eventosEnriquecidos,
          notes: (notesRes.data ?? []) as RawNoteRow[],
          tasks: (tasksRes.data ?? []) as RawTaskRow[],
          deals: (dealsRes.data ?? []) as RawDealRow[],
          activities: (activitiesRes.data ?? []) as RawActivityRow[],
          calls: (callsRes.data ?? []) as RawCallRow[],
        },
        { type, limit },
      );

      return { ...timeline, hasMore: timeline.hasMore || truncou };
    },
    enabled: !!contactId,
    staleTime: 30_000,
  });
}
