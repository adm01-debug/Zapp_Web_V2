/**
 * Estatísticas do contato da aba Journey — etapas S073–S083 e decisão D09.
 *
 * Função PURA: recebe as linhas JÁ BUSCADAS (nenhuma consulta, nenhum Supabase, nenhum efeito
 * colateral) e devolve os números do bloco "Do contato" (independe do período) e do bloco
 * "No período" (com tendência contra o período anterior) que o `JourneyStatsHero` mostra.
 *
 * Regras que valem para tudo — ficam escritas porque o número depende delas:
 * - Datas no FUSO LOCAL do navegador (regra do produto; `src/lib/localDay.ts`): nada de fatiar ISO.
 * - Linha com `at` ausente ou inválido é ignorada em toda conta (não vira NaN em canto nenhum).
 * - O `input` traz o histórico INTEIRO: o período escolhe o que entra nas contas — menos
 *   `firstInteractionAt`, `lastInteractionAt` e `daysSinceLast`, que são de TODO o histórico.
 * - Período é intervalo FECHADO dos dois lados (`from <= at <= to`); `from`/`to` nulos = sem limite.
 *   Período invertido (de > até) não casa com nada: quem normaliza é o resolvedor de período (J02).
 * - Sem amostra, média é `null` — nunca divisão por zero, NaN ou Infinity.
 */

import { localDayKey } from '@/lib/localDay';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Resposta depois disso não conta como tempo de resposta (etapa S076). */
export const RESPONSE_WINDOW_HOURS = 72;
/** Silêncio maior que isso separa dois episódios de atendimento (etapa S079). */
export const EPISODE_GAP_HOURS = 24;
/** Teto de dias da série diária (etapa S083). */
export const MAX_SERIES_DAYS = 120;
/** Janela da série quando o período é "qualquer data" (etapa S083). */
export const ANY_PERIOD_SERIES_DAYS = 90;
/** Trava da tendência em % (etapa S076). */
export const TREND_LIMIT_PCT = 999;

/**
 * Status de tarefa que já contam como concluída. `completed_at` também conclui, mesmo com status
 * legado — mesma regra do histórico atual (`useConversationHistoryTimeline`), senão tarefa feita
 * apareceria como aberta nas estatísticas.
 */
const TASK_CONCLUDED_STATUSES = new Set(['done', 'completed']);
/**
 * Status de ligação ATENDIDA: `answered` (em andamento) e `completed`. `ended` entra pelo sinal
 * de conversa: `talk_seconds` só existe quando alguém atendeu, então `ended` com tempo falado é
 * chamada atendida (e `ended` sem tempo falado, para entrada, é chamada perdida — `callStatus.ts`).
 */
const CALL_ANSWERED_STATUSES = new Set(['answered', 'completed']);
/** Status de ligação PERDIDA (`missed`/`no_answer` são os dois rótulos "não falou com ninguém"). */
const CALL_MISSED_STATUSES = new Set(['missed', 'no_answer']);
const DEAL_WON_STATUS = 'won';
const DEAL_LOST_STATUS = 'lost';

// ---------------------------------------------------------------- entrada

export type StatsMessageSender = 'agent' | 'contact';
export type StatsCallDirection = 'inbound' | 'outbound';
export type StatsEmailDirection = 'inbound' | 'outbound';
export type StatsCaseKind = 'closed' | 'reopened';

export interface StatsMessageRow {
  id: string;
  sender: StatsMessageSender;
  agentId: string | null;
  at: string;
}

export interface StatsCallRow {
  id: string;
  direction: StatsCallDirection;
  status: string;
  agentId: string | null;
  at: string;
  talkSeconds: number | null;
  durationSeconds: number | null;
}

export interface StatsEmailRow {
  id: string;
  threadId: string;
  direction: StatsEmailDirection;
  at: string;
}

export interface StatsNoteRow {
  id: string;
  at: string;
}

export interface StatsTaskRow {
  id: string;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  at: string;
}

export interface StatsFileRow {
  id: string;
  at: string;
}

export interface StatsDealRow {
  id: string;
  value: number | null;
  status: string;
  at: string;
}

export interface StatsTransferRow {
  id: string;
  at: string;
}

export interface StatsCaseRow {
  id: string;
  kind: StatsCaseKind;
  at: string;
}

export interface StatsCsat {
  average: number | null;
  count: number;
}

export interface StatsInput {
  messages: StatsMessageRow[];
  calls: StatsCallRow[];
  emails: StatsEmailRow[];
  notes: StatsNoteRow[];
  tasks: StatsTaskRow[];
  files: StatsFileRow[];
  deals: StatsDealRow[];
  transfers: StatsTransferRow[];
  cases: StatsCaseRow[];
  csat: StatsCsat;
}

/** Período do recorte. `null` nos dois lados = "qualquer data" (histórico inteiro). */
export interface StatsRange {
  from: Date | null;
  to: Date | null;
}

/** Período anterior equivalente, só para a tendência. */
export interface StatsPreviousPeriod {
  from: Date;
  to: Date;
}

export interface StatsUserProfile {
  name: string;
  avatarUrl: string | null;
}

// ---------------------------------------------------------------- saída

export interface JourneyTotals {
  messages: number;
  messagesSent: number;
  messagesReceived: number;
  emails: number;
  emailsSent: number;
  emailsReceived: number;
  calls: number;
  notes: number;
  tasks: number;
  files: number;
  deals: number;
  transfers: number;
  /** Soma das categorias acima. Encerramentos/reaberturas ficam em `episodes`, não aqui. */
  all: number;
}

export interface JourneyResponseStats {
  /** Tempo da 1ª resposta do período (minutos). */
  firstResponseMin: number | null;
  avgResponseMin: number | null;
  medianResponseMin: number | null;
  /** Quantos pares contato→resposta entraram na conta (base das médias). */
  sampleSize: number;
}

export interface JourneyCallStats {
  total: number;
  answered: number;
  missed: number;
  /** Total menos atendidas (inclui ocupada, recusada, cancelada e falha). */
  unanswered: number;
  talkSecondsTotal: number;
  avgTalkSeconds: number | null;
}

export interface JourneyEmailStats {
  sent: number;
  received: number;
  unansweredInbound: number;
}

export interface JourneyEpisodeStats {
  episodes: number;
  resolutions: number;
  reopenings: number;
}

export interface JourneyUserInteraction {
  agentId: string;
  name: string | null;
  avatarUrl: string | null;
  count: number;
  /** % das interações de atendentes do período, com uma casa decimal. */
  pct: number;
}

export interface JourneyUserRanking {
  ranking: JourneyUserInteraction[];
  top3: JourneyUserInteraction[];
  /** Todas as interações atribuídas a um atendente (base das %). */
  total: number;
}

export interface JourneyTaskStats {
  total: number;
  open: number;
  done: number;
  /** Prazo vencido e não concluída. Prazo nulo nunca atrasa. */
  overdue: number;
}

export interface JourneyDealStats {
  count: number;
  valueTotal: number;
  valueWon: number;
  won: number;
  lost: number;
}

export interface JourneyDailyPoint {
  /** `yyyy-MM-dd` no fuso local. */
  date: string;
  count: number;
}

export interface JourneyStats {
  totals: JourneyTotals;
  firstInteractionAt: string | null;
  lastInteractionAt: string | null;
  daysSinceLast: number | null;
  response: JourneyResponseStats;
  /** Variação % da resposta média contra o período anterior; `null` sem base; travada em ±999. */
  trendPct: number | null;
  calls: JourneyCallStats;
  emails: JourneyEmailStats;
  episodes: JourneyEpisodeStats;
  users: JourneyUserRanking;
  tasks: JourneyTaskStats;
  deals: JourneyDealStats;
  dailySeries: JourneyDailyPoint[];
  /** 0–23, pela contagem de mensagens do CONTATO; `null` sem mensagem do contato. */
  peakHour: number | null;
  /** 0–6 (domingo = 0), idem. */
  peakWeekday: number | null;
  csat: StatsCsat;
  /** Mesmos blocos do recorte anterior (a tendência compara com eles). */
  previous: {
    totals: JourneyTotals;
    response: JourneyResponseStats;
    episodes: JourneyEpisodeStats;
  } | null;
}

// ---------------------------------------------------------------- utilitários

interface Timed<T> {
  row: T;
  ms: number;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalized(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Instante de um carimbo do banco; ausente/inválido → `null` (a linha é ignorada). */
function instantOf(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

/** Limite do período em ms; data ausente ou inválida → `null` (sem limite). */
function boundOf(value: Date | null | undefined): number | null {
  if (!value) return null;
  const ms = value.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function timed<T>(rows: readonly T[] | undefined, read: (row: T) => string | null | undefined): Timed<T>[] {
  const out: Timed<T>[] = [];
  for (const row of rows ?? []) {
    if (!row) continue;
    const ms = instantOf(read(row));
    if (ms === null) continue;
    out.push({ row, ms });
  }
  return out;
}

interface Buckets {
  messages: Timed<StatsMessageRow>[];
  calls: Timed<StatsCallRow>[];
  emails: Timed<StatsEmailRow>[];
  notes: Timed<StatsNoteRow>[];
  tasks: Timed<StatsTaskRow>[];
  files: Timed<StatsFileRow>[];
  deals: Timed<StatsDealRow>[];
  transfers: Timed<StatsTransferRow>[];
  cases: Timed<StatsCaseRow>[];
}

function bucketTimedRows(input: StatsInput | null | undefined): Buckets {
  return {
    messages: timed(input?.messages, (row) => row.at),
    calls: timed(input?.calls, (row) => row.at),
    emails: timed(input?.emails, (row) => row.at),
    notes: timed(input?.notes, (row) => row.at),
    tasks: timed(input?.tasks, (row) => row.at),
    files: timed(input?.files, (row) => row.at),
    deals: timed(input?.deals, (row) => row.at),
    transfers: timed(input?.transfers, (row) => row.at),
    cases: timed(input?.cases, (row) => row.at),
  };
}

function sliceBuckets(buckets: Buckets, keep: (ms: number) => boolean): Buckets {
  return {
    messages: buckets.messages.filter((item) => keep(item.ms)),
    calls: buckets.calls.filter((item) => keep(item.ms)),
    emails: buckets.emails.filter((item) => keep(item.ms)),
    notes: buckets.notes.filter((item) => keep(item.ms)),
    tasks: buckets.tasks.filter((item) => keep(item.ms)),
    files: buckets.files.filter((item) => keep(item.ms)),
    deals: buckets.deals.filter((item) => keep(item.ms)),
    transfers: buckets.transfers.filter((item) => keep(item.ms)),
    cases: buckets.cases.filter((item) => keep(item.ms)),
  };
}

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

// ---------------------------------------------------------------- contas

function totalsOf(buckets: Buckets): JourneyTotals {
  let messagesSent = 0;
  let messagesReceived = 0;
  for (const item of buckets.messages) {
    if (item.row.sender === 'agent') messagesSent += 1;
    else messagesReceived += 1;
  }

  let emailsSent = 0;
  let emailsReceived = 0;
  for (const item of buckets.emails) {
    if (item.row.direction === 'outbound') emailsSent += 1;
    else emailsReceived += 1;
  }

  const totals: JourneyTotals = {
    messages: buckets.messages.length,
    messagesSent,
    messagesReceived,
    emails: buckets.emails.length,
    emailsSent,
    emailsReceived,
    calls: buckets.calls.length,
    notes: buckets.notes.length,
    tasks: buckets.tasks.length,
    files: buckets.files.length,
    deals: buckets.deals.length,
    transfers: buckets.transfers.length,
    all: 0,
  };
  // Encerramento/reabertura (`cases`) não entra em `all`: é desfecho de atendimento, não interação.
  totals.all =
    totals.messages +
    totals.emails +
    totals.calls +
    totals.notes +
    totals.tasks +
    totals.files +
    totals.deals +
    totals.transfers;
  return totals;
}

interface ResponsePair {
  /** Instante da mensagem do contato que abriu o par. */
  atMs: number;
  minutes: number;
}

/**
 * Pares contato → resposta: só conta quando a mensagem do contato é IMEDIATAMENTE seguida por uma
 * de atendente (rajada do contato conta uma vez, como no histórico atual) e quando a resposta veio
 * dentro de `RESPONSE_WINDOW_HOURS`. Os dois lados do par precisam estar no recorte.
 */
function responsePairs(buckets: Buckets): ResponsePair[] {
  const sorted = [...buckets.messages].sort((a, b) => a.ms - b.ms || (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0));
  const pairs: ResponsePair[] = [];
  const windowMs = RESPONSE_WINDOW_HOURS * HOUR_MS;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (current.row.sender !== 'contact' || next.row.sender !== 'agent') continue;
    const deltaMs = next.ms - current.ms;
    if (deltaMs < 0 || deltaMs > windowMs) continue;
    pairs.push({ atMs: current.ms, minutes: deltaMs / MINUTE_MS });
  }
  return pairs;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return round1(sorted[middle]);
  return round1((sorted[middle - 1] + sorted[middle]) / 2);
}

function responseStatsOf(pairs: ResponsePair[]): JourneyResponseStats {
  if (pairs.length === 0) {
    return { firstResponseMin: null, avgResponseMin: null, medianResponseMin: null, sampleSize: 0 };
  }
  const minutes = pairs.map((pair) => pair.minutes);
  const first = pairs.reduce((earliest, pair) => (pair.atMs < earliest.atMs ? pair : earliest), pairs[0]);
  const sum = minutes.reduce((total, value) => total + value, 0);
  return {
    firstResponseMin: round1(first.minutes),
    avgResponseMin: round1(sum / minutes.length),
    medianResponseMin: median(minutes),
    sampleSize: pairs.length,
  };
}

function trendAgainst(current: number | null, base: number | null): number | null {
  if (current === null || base === null || base === 0) return null;
  const pct = ((current - base) / base) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.max(-TREND_LIMIT_PCT, Math.min(TREND_LIMIT_PCT, round1(pct)));
}

/**
 * Segundos de conversa: só ligação ATENDIDA tem tempo falado (`talkSeconds` é o oficial;
 * `durationSeconds` entra como reserva em linha antiga sem `talk_seconds`). Duração de chamada
 * que ninguém atendeu é tempo de toque, não tempo falado.
 */
function callSeconds(row: StatsCallRow): number | null {
  if (!isAnsweredCall(row)) return null;
  const talk = finite(row.talkSeconds);
  if (talk !== null) return Math.max(0, Math.round(talk));
  const duration = finite(row.durationSeconds);
  return duration === null ? null : Math.max(0, Math.round(duration));
}

function isAnsweredCall(row: StatsCallRow): boolean {
  const status = normalized(row.status);
  if (CALL_ANSWERED_STATUSES.has(status)) return true;
  if (status !== 'ended') return false;
  const talk = finite(row.talkSeconds);
  return talk !== null && talk > 0;
}

function callsOf(buckets: Buckets): JourneyCallStats {
  let answered = 0;
  let missed = 0;
  let talkSecondsTotal = 0;
  let withDuration = 0;
  for (const item of buckets.calls) {
    const status = normalized(item.row.status);
    if (isAnsweredCall(item.row)) answered += 1;
    if (CALL_MISSED_STATUSES.has(status)) missed += 1;
    const seconds = callSeconds(item.row);
    if (seconds !== null) {
      talkSecondsTotal += seconds;
      withDuration += 1;
    }
  }
  return {
    total: buckets.calls.length,
    answered,
    missed,
    unanswered: buckets.calls.length - answered,
    talkSecondsTotal,
    avgTalkSeconds: withDuration === 0 ? null : Math.round(talkSecondsTotal / withDuration),
  };
}

/**
 * E-mail recebido sem resposta enviada DEPOIS dele na MESMA conversa. A resposta pode estar fora do
 * período (o `input` tem o histórico inteiro): o que se recorta é o conjunto de recebidos contados.
 */
function emailsOf(buckets: Buckets, allEmails: Timed<StatsEmailRow>[]): JourneyEmailStats {
  const sentByThread = new Map<string, number[]>();
  for (const item of allEmails) {
    if (item.row.direction !== 'outbound') continue;
    const list = sentByThread.get(item.row.threadId);
    if (list) list.push(item.ms);
    else sentByThread.set(item.row.threadId, [item.ms]);
  }

  let sent = 0;
  let received = 0;
  let unansweredInbound = 0;
  for (const item of buckets.emails) {
    if (item.row.direction === 'outbound') {
      sent += 1;
      continue;
    }
    received += 1;
    const replies = sentByThread.get(item.row.threadId) ?? [];
    const answeredAfter = replies.some((ms) => ms > item.ms);
    if (!answeredAfter) unansweredInbound += 1;
  }
  return { sent, received, unansweredInbound };
}

/**
 * Episódios de atendimento: interações da CONVERSA (mensagem, ligação e e-mail) ordenadas no tempo,
 * cortadas quando o silêncio passa de `EPISODE_GAP_HOURS` (24 h cravadas continuam no mesmo episódio).
 * Nota, tarefa, arquivo, proposta e transferência são trabalho interno e não abrem episódio.
 */
function conversationInstants(buckets: Buckets): number[] {
  const instants = [
    ...buckets.messages.map((item) => item.ms),
    ...buckets.calls.map((item) => item.ms),
    ...buckets.emails.map((item) => item.ms),
  ];
  instants.sort((a, b) => a - b);
  return instants;
}

function countEpisodes(instants: number[]): number {
  if (instants.length === 0) return 0;
  const gap = EPISODE_GAP_HOURS * HOUR_MS;
  let episodes = 1;
  for (let i = 1; i < instants.length; i += 1) {
    if (instants[i] - instants[i - 1] > gap) episodes += 1;
  }
  return episodes;
}

function episodesOf(buckets: Buckets): JourneyEpisodeStats {
  let resolutions = 0;
  let reopenings = 0;
  for (const item of buckets.cases) {
    if (item.row.kind === 'closed') resolutions += 1;
    else if (item.row.kind === 'reopened') reopenings += 1;
  }
  return { episodes: countEpisodes(conversationInstants(buckets)), resolutions, reopenings };
}

/**
 * Ranking de quem interagiu: mensagem ENVIADA por atendente e LIGAÇÃO com autor. Interação sem
 * autor (`agentId` nulo) não é atribuída a ninguém. Empate desempata pelo `agentId` crescente,
 * para a ordem não depender da ordem de chegada das linhas.
 */
function usersOf(buckets: Buckets, users: Record<string, StatsUserProfile> | undefined): JourneyUserRanking {
  const counts = new Map<string, number>();
  const bump = (agentId: string | null | undefined): void => {
    const id = typeof agentId === 'string' ? agentId.trim() : '';
    if (id.length === 0) return;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  for (const item of buckets.messages) {
    if (item.row.sender === 'agent') bump(item.row.agentId);
  }
  for (const item of buckets.calls) bump(item.row.agentId);

  let total = 0;
  for (const count of counts.values()) total += count;

  const ranking: JourneyUserInteraction[] = [...counts.entries()]
    .map(([agentId, count]) => {
      const profile = users?.[agentId];
      return {
        agentId,
        name: profile?.name ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
        count,
        pct: total === 0 ? 0 : round1((count / total) * 100),
      };
    })
    .sort((a, b) => b.count - a.count || (a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0));

  return { ranking, top3: ranking.slice(0, 3), total };
}

function tasksOf(buckets: Buckets, nowMs: number): JourneyTaskStats {
  let open = 0;
  let done = 0;
  let overdue = 0;
  for (const item of buckets.tasks) {
    const concluded = Boolean(item.row.completedAt) || TASK_CONCLUDED_STATUSES.has(normalized(item.row.status));
    if (concluded) done += 1;
    else open += 1;

    if (concluded) continue;
    const dueMs = instantOf(item.row.dueDate);
    if (dueMs !== null && dueMs < nowMs) overdue += 1;
  }
  return { total: buckets.tasks.length, open, done, overdue };
}

function dealsOf(buckets: Buckets): JourneyDealStats {
  let valueTotal = 0;
  let valueWon = 0;
  let won = 0;
  let lost = 0;
  for (const item of buckets.deals) {
    const value = finite(item.row.value);
    if (value !== null) valueTotal += value;
    const status = normalized(item.row.status);
    if (status === DEAL_WON_STATUS) {
      won += 1;
      if (value !== null) valueWon += value;
    } else if (status === DEAL_LOST_STATUS) {
      lost += 1;
    }
  }
  return { count: buckets.deals.length, valueTotal, valueWon, won, lost };
}

/**
 * Série diária (S083): dias do período em `yyyy-MM-dd` LOCAL, dias vazios com 0, teto de
 * `MAX_SERIES_DAYS` dias (corta pelo fim, que é o lado recente). Sem período definido, usa os
 * últimos `ANY_PERIOD_SERIES_DAYS` dias até `now`. Conta as interações (`cases` fora, como em `all`).
 */
function dailySeriesOf(buckets: Buckets, fromMs: number | null, toMs: number | null, nowMs: number): JourneyDailyPoint[] {
  const endMs = startOfLocalDay(toMs ?? nowMs);
  // `from` nulo (qualquer data, ou só "até"): 90 dias terminando no fim do recorte.
  const startCandidate = fromMs === null ? endMs - (ANY_PERIOD_SERIES_DAYS - 1) * DAY_MS : startOfLocalDay(fromMs);
  const spanDays = Math.floor((endMs - startCandidate) / DAY_MS) + 1;
  if (spanDays <= 0) return [];

  const startMs = spanDays > MAX_SERIES_DAYS ? endMs - (MAX_SERIES_DAYS - 1) * DAY_MS : startCandidate;
  const counts = new Map<string, number>();
  for (const ms of [
    ...buckets.messages.map((item) => item.ms),
    ...buckets.calls.map((item) => item.ms),
    ...buckets.emails.map((item) => item.ms),
    ...buckets.notes.map((item) => item.ms),
    ...buckets.tasks.map((item) => item.ms),
    ...buckets.files.map((item) => item.ms),
    ...buckets.deals.map((item) => item.ms),
    ...buckets.transfers.map((item) => item.ms),
  ]) {
    const key = localDayKey(new Date(ms));
    if (key === null) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const points: JourneyDailyPoint[] = [];
  for (let dayMs = startMs; dayMs <= endMs; dayMs += DAY_MS) {
    const key = localDayKey(new Date(dayMs));
    if (key === null) continue;
    points.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return points;
}

function peakOf(instants: number[], read: (date: Date) => number): number | null {
  if (instants.length === 0) return null;
  const counts = new Map<number, number>();
  for (const ms of instants) {
    const key = read(new Date(ms));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = -1;
  for (const key of [...counts.keys()].sort((a, b) => a - b)) {
    const count = counts.get(key) ?? 0;
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

function firstAndLast(instants: number[]): { firstMs: number | null; lastMs: number | null } {
  let firstMs: number | null = null;
  let lastMs: number | null = null;
  for (const ms of instants) {
    if (firstMs === null || ms < firstMs) firstMs = ms;
    if (lastMs === null || ms > lastMs) lastMs = ms;
  }
  return { firstMs, lastMs };
}

// ---------------------------------------------------------------- porta de entrada

/**
 * Calcula as estatísticas do contato a partir das linhas já buscadas.
 *
 * @param input  linhas do histórico inteiro (mensagens, ligações, e-mails, notas, tarefas, arquivos,
 *               propostas, transferências e encerramentos) + CSAT.
 * @param range  recorte do bloco "No período" (`null` nos dois lados = qualquer data).
 * @param prev   período anterior equivalente, para a tendência; `null` = sem base.
 * @param now    relógio de referência (tarefa atrasada, `daysSinceLast` e a série "qualquer data").
 * @param users  perfis por `agentId`, para nome e foto no ranking.
 */
export function computeJourneyStats(
  input: StatsInput,
  range: StatsRange,
  prev: StatsPreviousPeriod | null,
  now: Date = new Date(),
  users?: Record<string, StatsUserProfile>,
): JourneyStats {
  const nowMs = Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
  const fromMs = boundOf(range?.from);
  const toMs = boundOf(range?.to);
  const all = bucketTimedRows(input);

  const current = sliceBuckets(all, (ms) => (fromMs === null || ms >= fromMs) && (toMs === null || ms <= toMs));
  const prevFromMs = boundOf(prev?.from);
  const prevToMs = boundOf(prev?.to);
  const before =
    prevFromMs === null || prevToMs === null ? null : sliceBuckets(all, (ms) => ms >= prevFromMs && ms <= prevToMs);

  const currentPairs = responsePairs(current);
  const previousPairs = before === null ? [] : responsePairs(before);
  const previousResponse = before === null ? null : responseStatsOf(previousPairs);

  const { firstMs, lastMs } = firstAndLast([
    ...all.messages.map((item) => item.ms),
    ...all.calls.map((item) => item.ms),
    ...all.emails.map((item) => item.ms),
    ...all.notes.map((item) => item.ms),
    ...all.tasks.map((item) => item.ms),
    ...all.files.map((item) => item.ms),
    ...all.deals.map((item) => item.ms),
    ...all.transfers.map((item) => item.ms),
    ...all.cases.map((item) => item.ms),
  ]);

  const response = responseStatsOf(currentPairs);
  const contactInstants = current.messages.filter((item) => item.row.sender === 'contact').map((item) => item.ms);

  return {
    totals: totalsOf(current),
    firstInteractionAt: firstMs === null ? null : new Date(firstMs).toISOString(),
    lastInteractionAt: lastMs === null ? null : new Date(lastMs).toISOString(),
    daysSinceLast: lastMs === null ? null : Math.max(0, Math.floor((nowMs - lastMs) / DAY_MS)),
    response,
    trendPct: trendAgainst(response.avgResponseMin, previousResponse === null ? null : previousResponse.avgResponseMin),
    calls: callsOf(current),
    emails: emailsOf(current, all.emails),
    episodes: episodesOf(current),
    users: usersOf(current, users),
    tasks: tasksOf(current, nowMs),
    deals: dealsOf(current),
    dailySeries: dailySeriesOf(current, fromMs, toMs, nowMs),
    peakHour: peakOf(contactInstants, (date) => date.getHours()),
    peakWeekday: peakOf(contactInstants, (date) => date.getDay()),
    csat: { average: input?.csat?.average ?? null, count: input?.csat?.count ?? 0 },
    previous:
      before === null || previousResponse === null
        ? null
        : {
            totals: totalsOf(before),
            response: previousResponse,
            episodes: episodesOf(before),
          },
  };
}
