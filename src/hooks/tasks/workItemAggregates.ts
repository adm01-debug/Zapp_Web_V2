import { isBefore, startOfDay, addDays, formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { WorkItem, WorkItemStatus } from './workItem.types';
import type { TasksFilters } from './workItemFilters';

/** Peso de prioridade (menor = primeiro) — usado na ordenacao por prazo (etapa 49) e por coluna. */
const PRIORITY_WEIGHT: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export interface BucketsByDue {
  overdue: WorkItem[];
  today: WorkItem[];
  tomorrow: WorkItem[];
  upcoming: WorkItem[];
  noDue: WorkItem[];
  done7d: WorkItem[];
  /** Concluidas entre 8 e 30 dias — reveladas pelo "ver mais (30 dias)" da Lista (etapa 48/B4). */
  doneOlder: WorkItem[];
}

export interface KpiSnapshot {
  overdue: number;
  dueToday: number;
  doingCount: number;
  done7d: number;
  avgCycleTimeDays: number | null;
}

export function bucketByDue(items: WorkItem[], now: Date = new Date()): BucketsByDue {
  const todayStart     = startOfDay(now);
  const tomorrowStart  = startOfDay(addDays(now, 1));
  const day2Start      = startOfDay(addDays(now, 2));
  const sevenDaysAgo   = new Date(now.getTime() - 7 * 86_400_000);
  const thirtyDaysAgo  = new Date(now.getTime() - 30 * 86_400_000);

  const active = items.filter(i => i.status !== 'done' && i.status !== 'cancelled');
  const done = items.filter(i => i.status === 'done' && i.completed_at != null);
  const done7d = done.filter(i => new Date(i.completed_at!) >= sevenDaysAgo);
  // Etapa 48 (B4): a Lista mostra 7 dias e revela o resto da janela de 30 dias
  // (a query do hook ja traz 30d) no rodape "ver mais (30 dias)". Aqui fica o
  // recorte de 8 a 30 dias — o que a secao recolhida nao mostra.
  const doneOlder = done.filter(i =>
    isBefore(new Date(i.completed_at!), sevenDaysAgo) &&
    !isBefore(new Date(i.completed_at!), thirtyDaysAgo)
  );

  const overdue: WorkItem[]   = [];
  const today: WorkItem[]     = [];
  const tomorrow: WorkItem[]  = [];
  const upcoming: WorkItem[]  = [];
  const noDue: WorkItem[]     = [];

  for (const item of active) {
    if (!item.due_date) { noDue.push(item); continue; }
    const due = new Date(item.due_date);
    if (due < todayStart)    { overdue.push(item);  }
    else if (due < tomorrowStart) { today.push(item); }
    else if (due < day2Start)     { tomorrow.push(item); }
    else                          { upcoming.push(item); }
  }

  return { overdue, today, tomorrow, upcoming, noDue, done7d, doneOlder };
}

/**
 * Etapa 45/46: o recorte da barra de filtros, aplicado nos três modos (Lista,
 * Quadro e Agenda). Função pura: recebe os itens que a query única já carregou e
 * devolve o subconjunto — nenhum modo, e nenhum filtro, gera request novo.
 *
 * `done` é o único filtro que olha o estado terminal do item; `q` casa só o
 * título (o mesmo recorte que a busca sempre fez).
 */
export function applyFilters(items: WorkItem[], f: TasksFilters): WorkItem[] {
  const termo = f.q.trim().toLowerCase();

  return items.filter(item => {
    if (!f.done && item.status === 'done') return false;
    if (f.prio !== 'all' && item.priority !== f.prio) return false;
    if (f.contact !== null && item.contact?.id !== f.contact) return false;
    if (f.alarm && item.remind_at === null) return false;
    if (termo !== '' && !item.title.toLowerCase().includes(termo)) return false;
    return true;
  });
}

export function bucketByStatus(items: WorkItem[]): Record<WorkItemStatus, WorkItem[]> {
  const out: Record<WorkItemStatus, WorkItem[]> = {
    backlog: [], todo: [], doing: [], waiting: [], done: [], cancelled: [],
  };
  for (const item of items) out[item.status].push(item);
  for (const col of Object.values(out)) {
    col.sort((a, b) =>
      a.position - b.position ||
      (PRIORITY_WEIGHT[a.priority] ?? 2) - (PRIORITY_WEIGHT[b.priority] ?? 2) ||
      a.created_at.localeCompare(b.created_at)
    );
  }
  return out;
}

export function kpis(items: WorkItem[], now: Date = new Date()): KpiSnapshot {
  const { overdue, today, done7d } = bucketByDue(items, now);
  const doing = items.filter(i => i.status === 'doing');
  const cycleTimes = done7d
    .filter(i => i.started_at && i.completed_at)
    .map(i => (new Date(i.completed_at!).getTime() - new Date(i.started_at!).getTime()) / 86_400_000);
  return {
    overdue: overdue.length,
    dueToday: today.length,
    doingCount: doing.length,
    done7d: done7d.length,
    avgCycleTimeDays: cycleTimes.length > 0
      ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
      : null,
  };
}

export function dueLabel(
  dueDate: string,
  now: Date = new Date()
): { label: string; overdue: boolean } {
  const due          = new Date(dueDate);
  const todayStart   = startOfDay(now);
  const tomorrowStart = startOfDay(addDays(now, 1));
  const day2Start    = startOfDay(addDays(now, 2));

  if (due < todayStart) {
    const dist = formatDistanceToNowStrict(due, { locale: ptBR, addSuffix: false });
    return { label: 'Atrasada ' + dist, overdue: true };
  }
  if (due < tomorrowStart) return { label: 'Hoje', overdue: false };
  if (due < day2Start)     return { label: 'Amanha', overdue: false };

  const dayName  = due.toLocaleDateString('pt-BR', { weekday: 'short' });
  const dayMonth = due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return { label: dayName.replace('.', '') + ' ' + dayMonth, overdue: false };
}

/**
 * Chave de dia no fuso LOCAL (`AAAA-MM-DD`) — o MESMO dia que a Lista
 * (`bucketByDue`), o Quadro e os cabecalhos da Agenda ja usam (`setHours(0,0,0,0)`
 * + `format`). Fatiar o ISO em UTC (`toISOString().slice(0, 10)`) jogava a tarefa
 * das 23:59 locais no dia seguinte da Agenda. Devolve `null` para valor ausente ou
 * invalido, em vez de estourar dentro do filtro.
 */
function localDayKey(value: string | Date | null): string | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function weekBuckets(
  items: WorkItem[],
  startDate: Date
): Array<{ date: Date; reminders: WorkItem[]; dueTasks: WorkItem[] }> {
  return Array.from({ length: 7 }, (_, i) => {
    const day    = addDays(startDate, i);
    const dayStr = localDayKey(day);
    return {
      date: day,
      reminders: items.filter(it =>
        it.remind_at &&
        localDayKey(it.remind_at) === dayStr &&
        it.status !== 'done' && it.status !== 'cancelled'
      ),
      dueTasks: items.filter(it =>
        it.due_date &&
        localDayKey(it.due_date) === dayStr &&
        it.status !== 'done' && it.status !== 'cancelled'
      ),
    };
  });
}

export interface DayGroup {
  label: string;
  items: WorkItem[];
}

/**
 * Etapa 49: rotulo do subcabecalho de dia da secao "Proximas" — "Hoje", "Amanhã",
 * "Qua 01/10" (dentro de 7 dias) ou "Semana que vem" (mais de 7 dias).
 */
export function dayGroupLabel(dueDate: string, now: Date = new Date()): string {
  const due           = new Date(dueDate);
  const todayStart    = startOfDay(now);
  const tomorrowStart = startOfDay(addDays(now, 1));
  const day2Start     = startOfDay(addDays(now, 2));
  const sevenDayLimit = startOfDay(addDays(now, 7));

  if (due < todayStart)    return 'Atrasada';
  if (due < tomorrowStart) return 'Hoje';
  if (due < day2Start)     return 'Amanhã';

  const dueDay = startOfDay(due);
  if (isBefore(sevenDayLimit, dueDay)) return 'Semana que vem';

  const dayName  = due.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  const dayMonth = due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return dayName.charAt(0).toUpperCase() + dayName.slice(1) + ' ' + dayMonth;
}

/** Etapa 49: agrupa as "Proximas" por dia, na ordem prazo → prioridade. */
export function groupUpcomingByDay(items: WorkItem[], now: Date = new Date()): DayGroup[] {
  const ordered = items
    .filter(i => i.due_date != null)
    .slice()
    .sort((a, b) =>
      a.due_date!.localeCompare(b.due_date!) ||
      (PRIORITY_WEIGHT[a.priority] ?? 2) - (PRIORITY_WEIGHT[b.priority] ?? 2)
    );

  const groups: DayGroup[] = [];
  for (const item of ordered) {
    const label = dayGroupLabel(item.due_date!, now);
    const last  = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/**
 * Etapa 51 (B5): separa as concluidas da coluna Concluido do Quadro — os 7 dias
 * na frente (ordem `completed_at desc`) e o resto da janela de 30 dias atras do
 * rodape "Ver mais antigas (30 dias)". Concluida sem carimbo entra na janela
 * recente: tarefa nunca fica escondida por falta de dado.
 */
export function splitDoneByRecency(
  items: WorkItem[],
  now: Date = new Date()
): { recent: WorkItem[]; older: WorkItem[] } {
  const sevenDaysAgo  = now.getTime() - 7 * 86_400_000;
  const thirtyDaysAgo = now.getTime() - 30 * 86_400_000;
  const stamp = (i: WorkItem) => (i.completed_at ? new Date(i.completed_at).getTime() : null);

  const done = items.filter(i => i.status === 'done');
  const recent = done.filter(i => {
    const t = stamp(i);
    return t == null || t >= sevenDaysAgo;
  });
  const older = done.filter(i => {
    const t = stamp(i);
    return t != null && t >= thirtyDaysAgo && t < sevenDaysAgo;
  });

  const desc = (a: WorkItem, b: WorkItem) => (stamp(b) ?? 0) - (stamp(a) ?? 0);
  return { recent: recent.sort(desc), older: older.sort(desc) };
}
