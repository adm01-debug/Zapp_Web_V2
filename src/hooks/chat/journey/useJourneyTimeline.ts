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
 * - Ligações e e-mails da LISTA vêm dos hooks do J06 (`useJourneyCalls`/`useJourneyEmails`),
 *   que já resolvem escopo, ordem e paginação das duas fontes. A ESTATÍSTICA busca as mesmas
 *   duas fontes direto (mesmo recorte, mesmos mapeadores, sem teto de página), para o retrato
 *   do hero cobrir o período inteiro independente da rolagem.
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
import { mapCallRow, JOURNEY_CALLS_PAGE_SIZE } from './useJourneyCalls';
import { mapEmailRow, JOURNEY_EMAILS_PAGE_SIZE } from './useJourneyEmails';
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
 * Ids de TODAS as propostas do contato, sem recorte de período. As atividades de uma proposta
 * pertencem ao período pela data DA ATIVIDADE (`deal_activities.created_at`), não pela data de
 * criação da proposta: proposta criada antes do período ainda gera atividade dentro dele
 * (S040/S041). Sem `range` o PostgREST devolve até o limite padrão (1000) — folga de sobra para
 * as propostas de um único contato; se um dia estourar, esta função passa a paginar.
 */
export async function fetchContactDealIds(
  contactId: string,
): Promise<{ ids: string[]; falhou: boolean }> {
  const { data, error } = await supabase.from('sales_deals').select('id').eq('contact_id', contactId);
  if (error) return { ids: [], falhou: true };
  const ids = ((data ?? []) as Array<{ id: string | null }>)
    .map((linha) => String(linha.id ?? ''))
    .filter(Boolean);
  return { ids, falhou: false };
}

/**
 * Uma página da timeline. As atividades usam os ids de TODAS as propostas do contato (não só as
 * da página) e a SUA PRÓPRIA janela `range(from, to)` — paginação independente da paginação das
 * propostas: página de propostas vazia (ou proposta criada fora do período) não apaga as
 * atividades do período.
 *
 * `propostas === null` = a busca dos ids falhou (a página marca `falhou`, sem engolir o erro).
 */
async function buscarPaginaComPropostas(
  contactId: string,
  range: JourneyRangeIso,
  page: number,
  propostas: string[] | null,
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

  let propostasQuery = supabase.from('sales_deals').select(DEAL_COLUMNS).eq('contact_id', contactId);
  if (sinceIso) propostasQuery = propostasQuery.gte('created_at', sinceIso);
  if (untilIso) propostasQuery = propostasQuery.lte('created_at', untilIso);

  const [mensagensRes, eventosRes, notasRes, tarefasRes, propostasRes] = await Promise.all([
    mensagens.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to),
    eventos.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to),
    notas.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to),
    tarefas.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to),
    propostasQuery.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to),
  ]);

  const propostasLinhas = propostasRes.error ? [] : ((propostasRes.data ?? []) as DealRow[]);

  // Janela PRÓPRIA das atividades: recorte de período + ordem + range independentes da página
  // das propostas. `propostas` (todas as do contato) só alimenta o `in` — nunca o recorte.
  let atividadesRes: { data: unknown[] | null; error: unknown } = { data: [], error: null };
  if (propostas && propostas.length) {
    let atividades = supabase.from('deal_activities').select(ACTIVITY_COLUMNS).in('deal_id', propostas);
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
      propostas === null ||
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

/**
 * Uma página das fontes que este hook lê direto (rolagem da lista). Busca os ids das propostas
 * uma vez por página e delega a `buscarPaginaComPropostas`.
 */
export async function fetchTimelinePage(
  contactId: string,
  range: JourneyRangeIso,
  page: number,
): Promise<TimelinePage> {
  const { ids, falhou } = await fetchContactDealIds(contactId);
  return buscarPaginaComPropostas(contactId, range, page, falhou ? null : ids);
}

/** Teto de segurança dos laços de exaustão (100 páginas × 200–300 linhas). */
const MAX_PAGINAS_ESTATISTICA = 100;

/**
 * TODAS as páginas das seis fontes diretas, sem teto de 200. O retrato da estatística precisa do
 * período inteiro, independente de quantas páginas a rolagem da lista já carregou.
 */
async function buscarTodasPaginasFontes(
  contactId: string,
  range: JourneyRangeIso,
  propostas: string[] | null,
): Promise<{ fontes: Omit<JourneySources, 'calls' | 'emails'>; falhou: boolean }> {
  const messages: RawMessage[] = [];
  const events: RawConversationEvent[] = [];
  const notes: RawNote[] = [];
  const tasks: RawTask[] = [];
  const deals: RawDeal[] = [];
  const activities: RawActivity[] = [];
  let falhou = false;
  for (let page = 0; page < MAX_PAGINAS_ESTATISTICA; page++) {
    const pagina = await buscarPaginaComPropostas(contactId, range, page, propostas);
    if (pagina.falhou) falhou = true;
    messages.push(...(pagina.sources.messages ?? []));
    events.push(...(pagina.sources.events ?? []));
    notes.push(...(pagina.sources.notes ?? []));
    tasks.push(...(pagina.sources.tasks ?? []));
    deals.push(...(pagina.sources.deals ?? []));
    activities.push(...(pagina.sources.activities ?? []));
    if (!pagina.paginou) break;
  }
  return { fontes: { messages, events, notes, tasks, deals, activities }, falhou };
}

/**
 * Colunas das chamadas para a estatística — o MESMO conjunto que `useJourneyCalls` pede (sem
 * `recording_url`), para o `mapCallRow` continuar valendo aqui. Mesma regra vale para os
 * e-mails abaixo com `mapEmailRow` (sem corpo, sem endereço).
 */
const CALL_STATS_COLUMNS =
  'id, direction, status, started_at, answered_at, ended_at, duration_seconds, talk_seconds, agent_id, answered_by, end_reason, recording_status';
const EMAIL_STATS_COLUMNS =
  'id, thread_id, direction, subject, snippet, internal_date, from_name, email_threads!inner(assigned_to)';

/** TODAS as ligações do contato no período, sem teto de 200 (mesmo recorte do J06). */
async function buscarTodasChamadas(
  contactId: string,
  range: JourneyRangeIso,
): Promise<{ calls: RawCall[]; falhou: boolean }> {
  const { sinceIso, untilIso } = range;
  const calls: RawCall[] = [];
  let falhou = false;
  for (let page = 0; page < MAX_PAGINAS_ESTATISTICA; page++) {
    const from = page * JOURNEY_CALLS_PAGE_SIZE;
    const to = from + JOURNEY_CALLS_PAGE_SIZE - 1;
    let consulta = supabase.from('calls').select(CALL_STATS_COLUMNS).eq('contact_id', contactId);
    if (sinceIso) consulta = consulta.gte('started_at', sinceIso);
    if (untilIso) consulta = consulta.lte('started_at', untilIso);
    const { data, error } = await consulta
      .order('started_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    if (error) {
      falhou = true;
      break;
    }
    const linhas = (data ?? []) as Array<Parameters<typeof mapCallRow>[0]>;
    calls.push(...linhas.map(mapCallRow));
    if (linhas.length < JOURNEY_CALLS_PAGE_SIZE) break;
  }
  return { calls, falhou };
}

/** TODOS os e-mails do contato no período, sem teto de 300 (mesmo recorte do J06). */
async function buscarTodosEmails(
  contactId: string,
  range: JourneyRangeIso,
): Promise<{ emails: RawEmail[]; falhou: boolean }> {
  const { sinceIso, untilIso } = range;
  const emails: RawEmail[] = [];
  let falhou = false;
  for (let page = 0; page < MAX_PAGINAS_ESTATISTICA; page++) {
    const from = page * JOURNEY_EMAILS_PAGE_SIZE;
    const to = from + JOURNEY_EMAILS_PAGE_SIZE - 1;
    let consulta = supabase
      .from('email_messages')
      .select(EMAIL_STATS_COLUMNS)
      .eq('email_threads.contact_id', contactId);
    if (sinceIso) consulta = consulta.gte('email_threads.last_message_at', sinceIso);
    if (untilIso) consulta = consulta.lte('email_threads.last_message_at', untilIso);
    const { data, error } = await consulta
      .order('internal_date', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    if (error) {
      falhou = true;
      break;
    }
    const linhas = (data ?? []) as Array<Parameters<typeof mapEmailRow>[0]>;
    emails.push(...linhas.map(mapEmailRow));
    if (linhas.length < JOURNEY_EMAILS_PAGE_SIZE) break;
  }
  return { emails, falhou };
}

/**
 * Retrato COMPLETO de um período para a estatística: todas as páginas das fontes diretas mais
 * todas as ligações e e-mails, sem teto. `falhou` junta a falha de qualquer consulta — o
 * chamador marca o erro parcial em vez de engolir.
 */
export interface FullStatsResult {
  sources: JourneySources;
  falhou: boolean;
}

export async function fetchFullStatsSources(
  contactId: string,
  range: JourneyRangeIso,
): Promise<FullStatsResult> {
  const { ids, falhou: falhouIds } = await fetchContactDealIds(contactId);
  const propostas = falhouIds ? null : ids;
  const [diretas, chamadas, emails] = await Promise.all([
    buscarTodasPaginasFontes(contactId, range, propostas),
    buscarTodasChamadas(contactId, range),
    buscarTodosEmails(contactId, range),
  ]);
  return {
    sources: { ...diretas.fontes, calls: chamadas.calls, emails: emails.emails },
    falhou: falhouIds || diretas.falhou || chamadas.falhou || emails.falhou,
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

/** Bloco de fontes cruas vazio (retrato ainda não carregado). */
const FONTES_ZERADAS: JourneySources = {
  messages: [],
  events: [],
  calls: [],
  emails: [],
  notes: [],
  tasks: [],
  deals: [],
  activities: [],
};

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

  // Período anterior: retrato COMPLETO só para a estatística da tendência (sem teto de página).
  // Sem período anterior (intervalo aberto), a consulta nem parte.
  const previousStatsQuery = useQuery({
    queryKey: [...journeyTimelinePreviousKey(contactId, previousIso ?? RANGE_ABERTO), 'retrato-completo'],
    enabled: !!contactId && !!previousIso,
    queryFn: () => fetchFullStatsSources(contactId as string, previousIso as JourneyRangeIso),
    staleTime: 30_000,
  });

  // Retrato COMPLETO do período atual para o hero: todas as páginas das fontes diretas mais
  // todas as ligações e e-mails — independente de quantas páginas a rolagem já carregou.
  const statsQuery = useQuery({
    queryKey: [...journeyTimelineKey(contactId, rangeIso), 'retrato-completo'],
    enabled: !!contactId,
    queryFn: () => fetchFullStatsSources(contactId as string, rangeIso),
    staleTime: 30_000,
  });

  const fontes = useMemo(
    () => combinarFontes(timeline.data?.pages, chamadas.calls, emails.emails),
    [timeline.data, chamadas.calls, emails.emails],
  );

  // A lista usa as páginas carregadas pela rolagem; o hero e a tendência usam os retratos
  // completos (período inteiro, sem teto).
  const fontesStats = statsQuery.data?.sources ?? FONTES_ZERADAS;
  const fontesAnteriores: JourneySources = previousStatsQuery.data?.sources ?? FONTES_ZERADAS;

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

  const statsInput = useMemo(() => buildStatsInput(fontesStats), [fontesStats]);
  const previousStatsInput = useMemo(() => buildStatsInput(fontesAnteriores), [fontesAnteriores]);

  const loadMore = useCallback(() => {
    if (timeline.hasNextPage) void timeline.fetchNextPage();
    if (chamadas.hasMore) chamadas.fetchNextPage();
    if (emails.hasMore) emails.fetchNextPage();
  }, [timeline, chamadas, emails]);

  // Erro PARCIAL: a falha de QUALQUER consulta marca, sem apagar a lista do que carregou —
  // inclusive as do período anterior (retrato da tendência) e a de ids das propostas.
  const retratoAtualFalhou = statsQuery.data?.falhou ?? false;
  const retratoAnteriorFalhou = previousStatsQuery.data?.falhou ?? false;

  return {
    days,
    counts,
    actorCounts,
    actorIds,
    statsInput,
    previousStatsInput,
    isLoading:
      timeline.isLoading ||
      chamadas.isLoading ||
      emails.isLoading ||
      statsQuery.isLoading ||
      (previousIso ? previousStatsQuery.isLoading : false),
    isError:
      timeline.isError ||
      chamadas.isError ||
      emails.isError ||
      (timeline.data?.pages ?? []).some((pagina) => pagina.falhou) ||
      statsQuery.isError ||
      retratoAtualFalhou ||
      (previousIso ? previousStatsQuery.isError || retratoAnteriorFalhou : false),
    hasMore: !!timeline.hasNextPage || chamadas.hasMore || emails.hasMore,
    loadMore,
  };
}
