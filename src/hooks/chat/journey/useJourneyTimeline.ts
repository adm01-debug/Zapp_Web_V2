/**
 * Timeline do Histórico (Journey) — hook novo da aba (J08; etapas S047–S060 e S096).
 *
 * É UMA chamada, UMA lista, para a aba inteira: lê todas as fontes do contato no período
 * (`resolveRange`/`toIsoRange`, do J02), passa pelo mapeador do J07 (`mapJourneyEvents`) e devolve
 * os dias já agrupados. Nenhuma regra de tela mora aqui — a tela (J12) só desenha o que sai daqui.
 *
 * Fontes:
 * - `messages`, `conversation_events`, `contact_notes`, `conversation_tasks`, `sales_deals` e
 *   `deal_activities` são lidas AQUI, no escopo do contato (`contact_id`; atividades pela proposta),
 *   recortadas pelo intervalo (bordas inclusivas) e paginadas por rolagem (S096 — sem o teto de
 *   500/200 do hook antigo). Ordem determinística (`created_at` decrescente + desempate por `id`)
 *   porque `.range()` sem `.order()` estável repete ou pula linha.
 * - Ligações e e-mails vêm dos hooks do J06 (`useJourneyCalls`/`useJourneyEmails`), que já resolvem
 *   escopo, ordem e paginação das duas fontes.
 *
 * Só a lista de colunas usada é pedida ao banco; nenhum campo de gravação/corpo sai por este
 * caminho. As consultas usam o cliente RLS do usuário (nunca service role).
 *
 * ERRO PARCIAL: a falha de UMA fonte não derruba as outras. Cada fonte é lida no seu próprio
 * resultado; a que falha entra vazia e a página volta com `falhou = true`, que vira `isError` —
 * a tela mostra o erro e a lista continua com o que carregou.
 *
 * FILTROS (todos combinam — período + categoria + usuários):
 * - `days`: só os episódios que passam por categoria E por usuários, agrupados por dia LOCAL
 *   (`localDayKey`) e ordenados do mais recente (dias primeiro, episódios dentro do dia).
 * - `counts` (por categoria): quantos episódios há em cada categoria ENTRE os usuários escolhidos
 *   — o filtro de tipo conta o que os usuários marcados deixaram. Não muda com a categoria ativa.
 * - `actorCounts` (por chave de autor): quantos episódios há de cada autor ENTRE a categoria
 *   escolhida — o filtro de usuários conta o que o tipo marcado deixou. Não muda com os usuários ativos.
 *   Uma opção de filtro nunca esconde a própria contagem (regra de "contagem por opção", S055).
 * - `statsInput`/`previousStatsInput`: os retratos do período e do período anterior JUNTOS, sem
 *   filtro de tela — a estatística da aba não muda quando se alterna tipo ou usuário. São as
 *   entradas cruas de `computeJourneyStats` (S048: a tendência compara período atual e anterior).
 *
 * `users` usa o vocabulário do J11: as chaves `contact`, `system` ou o `profiles.id` do atendente;
 * lista vazia = todos.
 */
import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { localDayKey } from '@/lib/localDay';
import { CATEGORY_META } from '@/lib/journey/model';
import type { JourneyActor, JourneyCategory, JourneyDay, JourneyEvent } from '@/lib/journey/model';
import { mapJourneyEvents } from '@/lib/journey/mappers';
import type { JourneySources } from '@/lib/journey/mappers';
import type { JourneyPeriod } from '@/lib/journey/periodRange';
import { previousRange, resolveRange, toIsoRange } from '@/lib/journey/periodRange';
import type {
  JourneyRangeIso,
  RawActivity,
  RawCall,
  RawDeal,
  RawEmail,
  RawEvent as RawConversationEvent,
  RawMessage,
  RawNote,
  RawTask,
} from '@/lib/journey/rawRows';
import type { StatsInput } from '@/lib/journey/stats';
import { useJourneyCalls } from './useJourneyCalls';
import { useJourneyEmails } from './useJourneyEmails';

/** Episódios por página da rolagem (S096: sem o teto de 500 mensagens / 200 eventos). */
export const JOURNEY_TIMELINE_PAGE_SIZE = 200;

/** Lista de categorias na ordem em que as contagens são montadas (todas as chaves do modelo). */
const CATEGORIAS = Object.keys(CATEGORY_META) as JourneyCategory[];

/** Remetentes que contam como SAÍDA (mesma regra dos mapeadores): qualquer outro é o contato. */
const OUTBOUND_SENDERS = new Set(['agent', 'user', 'system', 'bot', 'ai', 'assistant']);

/** Mídia com rótulo próprio: NÃO vira "arquivo" (mesma decisão dos mapeadores, D07). */
const MEDIA_WITH_OWN_LABEL = new Set([
  'ptt',
  'audio',
  'audio_meme',
  'voice',
  'sticker',
  'vcard',
  'contact',
  'contact_card',
]);

/** Tipos de evento que a estatística conta como transferência/atribuição. */
const TRANSFER_EVENT_TYPES = new Set(['transfer', 'queue_transfer', 'overload_reassign', 'absence_reassign']);
const CLOSE_EVENT_TYPES = new Set(['close']);
const REOPEN_EVENT_TYPES = new Set(['reopen']);

/** Intervalo sem limites (usado só para desligar os hooks do J06 quando não há período anterior). */
const RANGE_ABERTO: JourneyRangeIso = { sinceIso: null, untilIso: null };

// ---------------------------------------------------------------- colunas e linhas cruas

const MESSAGE_COLUMNS = 'id, sender, agent_id, content, message_type, media_filename, media_size, media_type, created_at';
const EVENT_COLUMNS = 'id, event_type, from_agent_id, to_agent_id, from_queue_id, to_queue_id, performed_by, closure_id, created_at';
const NOTE_COLUMNS = 'id, author_id, content, category, due_date, is_done, created_at';
const TASK_COLUMNS = 'id, title, description, status, created_by, assigned_to, due_date, completed_at, started_at, created_at';
const DEAL_COLUMNS = 'id, title, value, status, assigned_to, created_at, won_at, lost_at, lost_reason';
const ACTIVITY_COLUMNS = 'id, deal_id, activity_type, description, performed_by, created_at';

interface MessageRow {
  id: string;
  sender: string;
  agent_id: string | null;
  content: string | null;
  message_type: string | null;
  media_filename: string | null;
  media_size: number | null;
  media_type: string | null;
  created_at: string;
}

interface EventRow {
  id: string;
  event_type: string;
  from_agent_id: string | null;
  to_agent_id: string | null;
  from_queue_id: string | null;
  to_queue_id: string | null;
  performed_by: string | null;
  closure_id: string | null;
  created_at: string;
}

interface NoteRow {
  id: string;
  author_id: string | null;
  content: string | null;
  category: string | null;
  due_date: string | null;
  is_done: boolean | null;
  created_at: string;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_by: string | null;
  assigned_to: string | null;
  due_date: string | null;
  completed_at: string | null;
  started_at: string | null;
  created_at: string;
}

interface DealRow {
  id: string;
  title: string;
  value: number | null;
  status: string | null;
  assigned_to: string | null;
  created_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  lost_reason: string | null;
}

interface ActivityRow {
  id: string;
  deal_id: string;
  activity_type: string;
  description: string | null;
  performed_by: string | null;
  created_at: string | null;
}

export function mapMessageRow(row: MessageRow): RawMessage {
  return {
    id: row.id,
    sender: row.sender,
    agentId: row.agent_id ?? null,
    content: row.content ?? '',
    messageType: row.message_type ?? '',
    mediaFilename: row.media_filename ?? null,
    mediaSize: row.media_size ?? null,
    mediaType: row.media_type ?? null,
    createdAt: row.created_at,
  };
}

export function mapEventRow(row: EventRow): RawConversationEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    fromAgentId: row.from_agent_id ?? null,
    toAgentId: row.to_agent_id ?? null,
    fromQueueId: row.from_queue_id ?? null,
    toQueueId: row.to_queue_id ?? null,
    performedBy: row.performed_by ?? null,
    closureId: row.closure_id ?? null,
    createdAt: row.created_at,
  };
}

export function mapNoteRow(row: NoteRow): RawNote {
  return {
    id: row.id,
    authorId: row.author_id ?? null,
    content: row.content ?? '',
    category: row.category ?? '',
    dueDate: row.due_date ?? null,
    isDone: row.is_done ?? false,
    createdAt: row.created_at,
  };
}

export function mapTaskRow(row: TaskRow): RawTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    createdBy: row.created_by ?? null,
    assignedTo: row.assigned_to ?? null,
    dueDate: row.due_date ?? null,
    completedAt: row.completed_at ?? null,
    startedAt: row.started_at ?? null,
    createdAt: row.created_at,
  };
}

export function mapDealRow(row: DealRow): RawDeal {
  return {
    id: row.id,
    title: row.title,
    value: row.value ?? null,
    status: row.status ?? null,
    assignedTo: row.assigned_to ?? null,
    createdAt: row.created_at ?? null,
    wonAt: row.won_at ?? null,
    lostAt: row.lost_at ?? null,
    lostReason: row.lost_reason ?? null,
  };
}

export function mapActivityRow(row: ActivityRow): RawActivity {
  return {
    id: row.id,
    dealId: row.deal_id,
    activityType: row.activity_type,
    description: row.description ?? null,
    performedBy: row.performed_by ?? null,
    createdAt: row.created_at ?? null,
  };
}

// ---------------------------------------------------------------- busca de uma página

interface TimelinePage {
  sources: JourneySources;
  /** Alguma fonte falhou nesta página (a lista continua com as que carregaram). */
  falhou: boolean;
  /** Alguma fonte devolveu a página cheia — pode haver mais no servidor. */
  paginou: boolean;
}

/**
 * Uma página das seis fontes que este hook lê direto. As consultas rodam em paralelo; cada uma
 * carrega o próprio `error`, para que a falha de uma não apague as outras. As atividades vêm
 * depois, presas às propostas desta página (é o único caminho até elas pelo contato).
 */
export async function fetchTimelinePage(
  contactId: string,
  range: JourneyRangeIso,
  page: number,
): Promise<TimelinePage> {
  const from = page * JOURNEY_TIMELINE_PAGE_SIZE;
  const to = from + JOURNEY_TIMELINE_PAGE_SIZE - 1;
  const { sinceIso, untilIso } = range;

  let mensagens = supabase.from('messages').select(MESSAGE_COLUMNS).eq('contact_id', contactId);
  if (sinceIso) mensagens = mensagens.gte('created_at', sinceIso);
  if (untilIso) mensagens = mensagens.lte('created_at', untilIso);

  let eventos = supabase.from('conversation_events').select(EVENT_COLUMNS).eq('contact_id', contactId);
  if (sinceIso) eventos = eventos.gte('created_at', sinceIso);
  if (untilIso) eventos = eventos.lte('created_at', untilIso);

  let notas = supabase.from('contact_notes').select(NOTE_COLUMNS).eq('contact_id', contactId);
  if (sinceIso) notas = notas.gte('created_at', sinceIso);
  if (untilIso) notas = notas.lte('created_at', untilIso);

  let tarefas = supabase.from('conversation_tasks').select(TASK_COLUMNS).eq('contact_id', contactId);
  if (sinceIso) tarefas = tarefas.gte('created_at', sinceIso);
  if (untilIso) tarefas = tarefas.lte('created_at', untilIso);

  let propostas = supabase.from('sales_deals').select(DEAL_COLUMNS).eq('contact_id', contactId);
  if (sinceIso) propostas = propostas.gte('created_at', sinceIso);
  if (untilIso) propostas = propostas.lte('created_at', untilIso);

  const [mensagensRes, eventosRes, notasRes, tarefasRes, propostasRes] = await Promise.all([
    mensagens.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to),
    eventos.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to),
    notas.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to),
    tarefas.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to),
    propostas.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to),
  ]);

  const propostasLinhas = propostasRes.error ? [] : ((propostasRes.data ?? []) as DealRow[]);
  const dealIds = propostasLinhas.map((d) => d.id);

  let atividadesRes: { data: unknown[] | null; error: unknown } = { data: [], error: null };
  if (dealIds.length) {
    let atividades = supabase.from('deal_activities').select(ACTIVITY_COLUMNS).in('deal_id', dealIds);
    if (sinceIso) atividades = atividades.gte('created_at', sinceIso);
    if (untilIso) atividades = atividades.lte('created_at', untilIso);
    atividadesRes = await atividades
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
  }

  const mensagensLinhas = mensagensRes.error ? [] : ((mensagensRes.data ?? []) as MessageRow[]);
  const eventosLinhas = eventosRes.error ? [] : ((eventosRes.data ?? []) as EventRow[]);
  const notasLinhas = notasRes.error ? [] : ((notasRes.data ?? []) as NoteRow[]);
  const tarefasLinhas = tarefasRes.error ? [] : ((tarefasRes.data ?? []) as TaskRow[]);
  const atividadesLinhas = atividadesRes.error ? [] : ((atividadesRes.data ?? []) as ActivityRow[]);

  const cheia = (n: number) => n === JOURNEY_TIMELINE_PAGE_SIZE;

  return {
    sources: {
      messages: mensagensLinhas.map(mapMessageRow),
      events: eventosLinhas.map(mapEventRow),
      notes: notasLinhas.map(mapNoteRow),
      tasks: tarefasLinhas.map(mapTaskRow),
      deals: propostasLinhas.map(mapDealRow),
      activities: atividadesLinhas.map(mapActivityRow),
    },
    falhou:
      !!mensagensRes.error ||
      !!eventosRes.error ||
      !!notasRes.error ||
      !!tarefasRes.error ||
      !!propostasRes.error ||
      !!atividadesRes.error,
    paginou:
      cheia(mensagensLinhas.length) ||
      cheia(eventosLinhas.length) ||
      cheia(notasLinhas.length) ||
      cheia(tarefasLinhas.length) ||
      cheia(propostasLinhas.length) ||
      cheia(atividadesLinhas.length),
  };
}

// ---------------------------------------------------------------- estatística

function remetenteEhSaida(sender: string | null | undefined): boolean {
  return OUTBOUND_SENDERS.has((sender ?? '').trim().toLowerCase());
}

/** Mensagem que a estatística conta como ARQUIVO (mesma regra do mapeador: mídia sem rótulo próprio). */
function mensagemEhArquivo(message: RawMessage): boolean {
  const temMidia = !!(message.mediaFilename?.trim() || message.mediaType?.trim());
  if (!temMidia) return false;
  return !MEDIA_WITH_OWN_LABEL.has((message.messageType ?? '').trim().toLowerCase());
}

/**
 * Retrato do período no formato de `computeJourneyStats` (S048). Sem filtro de tela: é a mesma
 * conta para o período atual e para o anterior, e por isso os dois lados da tendência saem daqui.
 */
export function buildStatsInput(sources: JourneySources): StatsInput {
  const messages: StatsInput['messages'] = [];
  const files: StatsInput['files'] = [];
  for (const message of sources.messages ?? []) {
    if (mensagemEhArquivo(message)) {
      files.push({ id: message.id, at: message.createdAt });
    } else {
      messages.push({
        id: message.id,
        sender: remetenteEhSaida(message.sender) ? 'agent' : 'contact',
        agentId: message.agentId,
        at: message.createdAt,
      });
    }
  }

  const transfers: StatsInput['transfers'] = [];
  const cases: StatsInput['cases'] = [];
  for (const event of sources.events ?? []) {
    const tipo = (event.eventType ?? '').trim().toLowerCase();
    if (TRANSFER_EVENT_TYPES.has(tipo)) transfers.push({ id: event.id, at: event.createdAt });
    else if (CLOSE_EVENT_TYPES.has(tipo)) cases.push({ id: event.id, kind: 'closed', at: event.createdAt });
    else if (REOPEN_EVENT_TYPES.has(tipo)) cases.push({ id: event.id, kind: 'reopened', at: event.createdAt });
  }

  return {
    messages,
    calls: (sources.calls ?? []).map((call) => ({
      id: call.id,
      direction: call.direction === 'outbound' ? 'outbound' : 'inbound',
      status: call.status,
      agentId: call.agentId,
      at: call.startedAt,
      talkSeconds: call.talkSeconds,
      durationSeconds: call.durationSeconds,
    })),
    emails: (sources.emails ?? []).map((email) => ({
      id: email.id,
      threadId: email.threadId,
      direction: email.direction === 'outbound' ? 'outbound' : 'inbound',
      at: email.at,
    })),
    notes: (sources.notes ?? []).map((note) => ({ id: note.id, at: note.createdAt })),
    tasks: (sources.tasks ?? []).map((task) => ({
      id: task.id,
      status: task.status,
      dueDate: task.dueDate,
      completedAt: task.completedAt,
      at: task.createdAt,
    })),
    files,
    deals: (sources.deals ?? []).map((deal) => ({
      id: deal.id,
      value: deal.value,
      status: deal.status ?? '',
      at: deal.createdAt ?? '',
    })),
    transfers,
    cases,
    csat: { average: null, count: 0 },
  };
}

// ---------------------------------------------------------------- chaves e estado

/** Chave de cache do período atual: contato + as duas pontas (primitivas, para não invalidar à toa). */
export const journeyTimelineKey = (
  contactId: string | null | undefined,
  range: JourneyRangeIso,
): readonly unknown[] => ['journey-timeline', contactId ?? null, range.sinceIso, range.untilIso];

/** Chave de cache do período anterior (só a estatística da tendência a usa). */
export const journeyTimelinePreviousKey = (
  contactId: string | null | undefined,
  range: JourneyRangeIso,
): readonly unknown[] => ['journey-timeline-previous', contactId ?? null, range.sinceIso, range.untilIso];

/** Chave do filtro de usuários: `contact`, `system` ou o `profiles.id` do atendente. */
export function journeyActorKey(actor: JourneyActor | null | undefined): string {
  if (!actor || actor.kind === 'contact') return 'contact';
  if (actor.kind === 'system') return 'system';
  return actor.id ?? 'system';
}

export interface UseJourneyTimelineOptions {
  period: JourneyPeriod;
  /** `all` ou uma categoria (todos os filtros combinam). */
  category?: 'all' | JourneyCategory;
  /** Chaves do filtro de usuários (`contact`, `system` ou id do atendente); vazio = todos. */
  users?: readonly string[];
  /** Relógio de referência do período; injetado nos testes, o padrão é o agora. */
  now?: Date;
}

export interface JourneyTimelineState {
  days: JourneyDay[];
  counts: Record<JourneyCategory, number>;
  actorCounts: Record<string, number>;
  actorIds: string[];
  statsInput: StatsInput;
  previousStatsInput: StatsInput;
  isLoading: boolean;
  isError: boolean;
  hasMore: boolean;
  loadMore: () => void;
}

/** Junta as páginas já carregadas num único bloco de fontes cruas. */
function combinarFontes(pages: TimelinePage[] | undefined, calls: RawCall[], emails: RawEmail[]): JourneySources {
  const paginas = pages ?? [];
  return {
    messages: paginas.flatMap((pagina) => pagina.sources.messages ?? []),
    calls,
    emails,
    notes: paginas.flatMap((pagina) => pagina.sources.notes ?? []),
    tasks: paginas.flatMap((pagina) => pagina.sources.tasks ?? []),
    events: paginas.flatMap((pagina) => pagina.sources.events ?? []),
    deals: paginas.flatMap((pagina) => pagina.sources.deals ?? []),
    activities: paginas.flatMap((pagina) => pagina.sources.activities ?? []),
  };
}

export function useJourneyTimeline(
  contactId: string | null | undefined,
  options: UseJourneyTimelineOptions,
): JourneyTimelineState {
  const { period, category = 'all', users = [], now } = options;

  const referencia = useMemo(() => now ?? new Date(), [now]);
  const range = useMemo(() => resolveRange(period, referencia), [period, referencia]);
  const rangeIso = useMemo(() => toIsoRange(range), [range]);
  const previousIso = useMemo(() => {
    const anterior = previousRange(range);
    return anterior ? toIsoRange(anterior) : null;
  }, [range]);

  const timeline = useInfiniteQuery({
    queryKey: journeyTimelineKey(contactId, rangeIso),
    enabled: !!contactId,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchTimelinePage(contactId as string, rangeIso, pageParam),
    // Página cheia = pode haver mais; página incompleta = fim da lista.
    getNextPageParam: (lastPage, allPages) => (lastPage.paginou ? allPages.length : undefined),
    staleTime: 30_000,
  });

  const chamadas = useJourneyCalls({ contactId, range: rangeIso });
  const emails = useJourneyEmails({ contactId, range: rangeIso });

  // Período anterior: só para a estatística da tendência. Sem período anterior (intervalo aberto),
  // os hooks do J06 ficam desligados (contato nulo) e a consulta própria nem parte.
  const previousQuery = useQuery({
    queryKey: journeyTimelinePreviousKey(contactId, previousIso ?? RANGE_ABERTO),
    enabled: !!contactId && !!previousIso,
    queryFn: () => fetchTimelinePage(contactId as string, previousIso as JourneyRangeIso, 0),
    staleTime: 30_000,
  });
  const chamadasAnteriores = useJourneyCalls({
    contactId: previousIso ? contactId : null,
    range: previousIso ?? RANGE_ABERTO,
  });
  const emailsAnteriores = useJourneyEmails({
    contactId: previousIso ? contactId : null,
    range: previousIso ?? RANGE_ABERTO,
  });

  const fontes = useMemo(
    () => combinarFontes(timeline.data?.pages, chamadas.calls, emails.emails),
    [timeline.data, chamadas.calls, emails.emails],
  );
  const fontesAnteriores = useMemo(
    () => combinarFontes(previousQuery.data ? [previousQuery.data] : [], chamadasAnteriores.calls, emailsAnteriores.emails),
    [previousQuery.data, chamadasAnteriores.calls, emailsAnteriores.emails],
  );

  const eventos = useMemo(() => mapJourneyEvents(fontes, { now: referencia }), [fontes, referencia]);

  // `counts` conta dentro do recorte de USUÁRIOS; `actorCounts` dentro do recorte de CATEGORIA.
  // Cada opção de filtro nunca esconde a própria contagem (S055) e os filtros combinam (S056).
  const eventosPorUsuario = useMemo(
    () => (users.length ? eventos.filter((evento) => users.includes(journeyActorKey(evento.actor))) : eventos),
    [eventos, users],
  );
  const eventosPorCategoria = useMemo(
    () => (category === 'all' ? eventos : eventos.filter((evento) => evento.category === category)),
    [eventos, category],
  );

  const counts = useMemo(() => {
    const contagem = Object.fromEntries(CATEGORIAS.map((c) => [c, 0])) as Record<JourneyCategory, number>;
    for (const evento of eventosPorUsuario) contagem[evento.category] += 1;
    return contagem;
  }, [eventosPorUsuario]);

  const actorCounts = useMemo(() => {
    const contagem: Record<string, number> = {};
    for (const evento of eventosPorCategoria) {
      const chave = journeyActorKey(evento.actor);
      contagem[chave] = (contagem[chave] ?? 0) + 1;
    }
    return contagem;
  }, [eventosPorCategoria]);

  const actorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const evento of eventos) {
      if (evento.actor.kind === 'user' && evento.actor.id) ids.add(evento.actor.id);
    }
    return Array.from(ids);
  }, [eventos]);

  // Dias do mais recente para o antigo: `mapJourneyEvents` já vem ordenado (desc), então a ordem
  // de inserção do `Map` é a ordem dos dias e a dos episódios dentro de cada dia.
  const days = useMemo(() => {
    const porDia = new Map<string, JourneyEvent[]>();
    const filtrados = category === 'all'
      ? eventosPorUsuario
      : eventosPorUsuario.filter((evento) => evento.category === category);
    for (const evento of filtrados) {
      const dia = localDayKey(evento.at);
      if (!dia) continue;
      const atual = porDia.get(dia);
      if (atual) atual.push(evento);
      else porDia.set(dia, [evento]);
    }
    return Array.from(porDia.entries()).map(([date, dayEvents]) => ({ date, events: dayEvents }));
  }, [eventosPorUsuario, category]);

  const statsInput = useMemo(() => buildStatsInput(fontes), [fontes]);
  const previousStatsInput = useMemo(() => buildStatsInput(fontesAnteriores), [fontesAnteriores]);

  const loadMore = useCallback(() => {
    if (timeline.hasNextPage) void timeline.fetchNextPage();
    if (chamadas.hasMore) chamadas.fetchNextPage();
    if (emails.hasMore) emails.fetchNextPage();
  }, [timeline, chamadas, emails]);

  return {
    days,
    counts,
    actorCounts,
    actorIds,
    statsInput,
    previousStatsInput,
    isLoading: timeline.isLoading || chamadas.isLoading || emails.isLoading,
    isError:
      timeline.isError ||
      chamadas.isError ||
      emails.isError ||
      (timeline.data?.pages ?? []).some((pagina) => pagina.falhou),
    hasMore: !!timeline.hasNextPage || chamadas.hasMore || emails.hasMore,
    loadMore,
  };
}
