import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TimelineEventKind =
  | 'message_in' | 'message_out' | 'note' | 'transfer' | 'assign' | 'file' | 'task' | 'deal' | 'close' | 'reopen';

export type TimelineTypeFilter = 'all' | 'messages' | 'notes' | 'tasks' | 'transfers' | 'files' | 'deals';

export interface TimelineEvent {
  id: string;
  at: string;
  kind: TimelineEventKind;
  title: string;
  subtitle?: string;
  pill?: { label: string; tone: 'success' | 'warning' | 'primary' | 'muted' | 'destructive' };
  count?: number;
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
  from_agent_name?: string | null;
  to_agent_name?: string | null;
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

export interface TimelineRawRows {
  messages: RawMessageRow[];
  events: RawEventRow[];
  notes: RawNoteRow[];
  tasks: RawTaskRow[];
  deals: RawDealRow[];
  activities: RawActivityRow[];
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
};

const ASSIGN_TYPES = new Set(['assign', 'unassign']);
const TRANSFER_TYPES = new Set(['transfer', 'queue_transfer', 'overload_reassign', 'absence_reassign']);

function truncate(text: string | null | undefined, max = 120): string | undefined {
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max)}…` : text;
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
      pill: t.status === 'completed' ? { label: 'Concluída', tone: 'success' } : { label: 'Pendente', tone: 'warning' },
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
      .map(({ e, kind }): TimelineEvent => ({
        id: `event-${e.id}`,
        at: e.created_at,
        kind,
        title: kind === 'transfer' ? 'Transferência' : kind === 'assign' ? 'Atribuição' : kind === 'close' ? 'Conversa encerrada' : 'Conversa reaberta',
        subtitle: e.from_agent_name && e.to_agent_name ? `De: ${e.from_agent_name} · Para: ${e.to_agent_name}` : undefined,
      })),
  ]
    .filter((e) => e.at)
    .sort((a, b) => b.at.localeCompare(a.at));

  const filtered = type === 'all' ? events : events.filter((e) => TYPE_KINDS[type].includes(e.kind));
  const hasMore = filtered.length > limit;
  const limited = filtered.slice(0, limit);

  const days = new Map<string, TimelineEvent[]>();
  for (const event of limited) {
    const day = event.at.slice(0, 10);
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
      total: rows.messages.length + rows.events.length + rows.tasks.length + rows.notes.length + rows.deals.length + rows.activities.length,
      lastContactAt,
      avgResponseMin: averageResponseMinutes(rows.messages),
      avgResponsePrevMin: rows.previousMessages ? averageResponseMinutes(rows.previousMessages) : null,
      resolutions,
    },
    hasMore,
  };
}

export const conversationHistoryKey = (contactId: string | null | undefined, period: number, type: TimelineTypeFilter) =>
  ['conversation-history', contactId, period, type] as const;

export function useConversationHistoryTimeline(
  contactId: string | null | undefined,
  period: 7 | 30 | 90 | 0 = 30,
  type: TimelineTypeFilter = 'all',
) {
  return useQuery({
    queryKey: conversationHistoryKey(contactId, period, type),
    queryFn: async () => {
      const cid = contactId as string;
      const sinceIso = period > 0 ? new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString() : null;

      const messagesQuery = supabase
        .from('messages')
        .select('id, sender, content, media_url, media_filename, media_size, created_at')
        .eq('contact_id', cid)
        .order('created_at', { ascending: false })
        .limit(500);
      const eventsQuery = supabase
        .from('conversation_events')
        .select('id, event_type, created_at')
        .eq('contact_id', cid)
        .order('created_at', { ascending: false })
        .limit(200);
      const notesQuery = supabase.from('contact_notes').select('id, content, created_at').eq('contact_id', cid);
      const tasksQuery = supabase.from('conversation_tasks').select('id, title, status, created_at').eq('contact_id', cid);
      const dealsQuery = supabase.from('sales_deals').select('id, title, value, status, created_at').eq('contact_id', cid);

      const [messagesRes, eventsRes, notesRes, tasksRes, dealsRes] = await Promise.all([
        sinceIso ? messagesQuery.gte('created_at', sinceIso) : messagesQuery,
        sinceIso ? eventsQuery.gte('created_at', sinceIso) : eventsQuery,
        sinceIso ? notesQuery.gte('created_at', sinceIso) : notesQuery,
        sinceIso ? tasksQuery.gte('created_at', sinceIso) : tasksQuery,
        sinceIso ? dealsQuery.gte('created_at', sinceIso) : dealsQuery,
      ]);
      if (messagesRes.error) throw messagesRes.error;
      if (eventsRes.error) throw eventsRes.error;
      if (notesRes.error) throw notesRes.error;
      if (tasksRes.error) throw tasksRes.error;
      if (dealsRes.error) throw dealsRes.error;

      const dealIds = (dealsRes.data ?? []).map((d) => d.id);
      const activitiesRes = dealIds.length
        ? await supabase.from('deal_activities').select('id, deal_id, description, activity_type, created_at').in('deal_id', dealIds)
        : { data: [] as RawActivityRow[], error: null };
      if (activitiesRes.error) throw activitiesRes.error;

      return buildTimeline(
        {
          messages: (messagesRes.data ?? []) as RawMessageRow[],
          events: (eventsRes.data ?? []) as RawEventRow[],
          notes: (notesRes.data ?? []) as RawNoteRow[],
          tasks: (tasksRes.data ?? []) as RawTaskRow[],
          deals: (dealsRes.data ?? []) as RawDealRow[],
          activities: (activitiesRes.data ?? []) as RawActivityRow[],
        },
        { type },
      );
    },
    enabled: !!contactId,
    staleTime: 30_000,
  });
}
