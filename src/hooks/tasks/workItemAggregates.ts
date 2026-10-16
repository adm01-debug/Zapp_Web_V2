import { isBefore, startOfDay, addDays, format, formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { WorkItem, WorkItemStatus } from './workItem.types';
import type { TasksFilters, DueFilter } from './workItemFilters';
import { localDayKey } from '@/lib/localDay';

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
  /** Tempo de ciclo (`started_at` → `completed_at`) — mantido para quem já lê hoje. */
  avgCycleTimeDays: number | null;
  /**
   * Etapa 21 / D13: tempo médio **da criação à conclusão** (`created_at` →
   * `completed_at`) das concluídas dos últimos 7 dias, em dias. É o número que
   * o rótulo "Da criação à conclusão" promete (o de ciclo mede outra coisa).
   */
  avgLeadTimeDays: number | null;
}

/**
 * R2-MOD-058 — regra Única de "prazo vencido" do módulo de Tarefas. O app grava
 * dois tipos de prazo (`temHora`) e cada um vence de um jeito:
 *
 *  - **com hora marcada** (ex.: hoje às 9h): vence no INSTANTE — às 15h do mesmo
 *    dia já está atrasado;
 *  - **de dia inteiro** (23:59 e 00:00 locais, a convenção dos chips
 *    "Hoje/Amanhã/Próx. semana" e do QuickAdd da Agenda): vence quando o dia
 *    LOCAL termina — às 15h do mesmo dia ainda é "Hoje".
 *
 * Antes o badge do menu comparava o prazo com o instante e o módulo (KPI, seções
 * e chip) só com o início do dia: a mesma tarefa acendia o menu e não aparecia em
 * "Atrasadas" na lista que deveria explicá-la. Agora badge, `bucketByDue`
 * (KPI e grupos), `dueLabel` (o chip `DueChip`) e `dayGroupLabel` chamam esta
 * função — um veredito só.
 */
export function isOverdue(dueDate: string | null | undefined, now: Date = new Date()): boolean {
  if (dueDate == null) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;   // data inválida não é atraso
  if (temHora(dueDate)) return due.getTime() < now.getTime();
  return due < startOfDay(now);
}

export function bucketByDue(items: WorkItem[], now: Date = new Date()): BucketsByDue {
  const tomorrowStart  = startOfDay(addDays(now, 1));
  const day2Start      = startOfDay(addDays(now, 2));
  const sevenDaysAgo   = new Date(now.getTime() - 7 * 86_400_000);
  const thirtyDaysAgo  = new Date(now.getTime() - 30 * 86_400_000);

  const active = items.filter(i => i.status !== 'done' && i.status !== 'cancelled');
  const done = items.filter(i => i.status === 'done');
  const done7d = done.filter(i => i.completed_at == null || new Date(i.completed_at) >= sevenDaysAgo);
  const doneOlder = done.filter(i =>
    i.completed_at != null &&
    isBefore(new Date(i.completed_at), sevenDaysAgo) &&
    !isBefore(new Date(i.completed_at), thirtyDaysAgo)
  );

  const overdue: WorkItem[]   = [];
  const today: WorkItem[]     = [];
  const tomorrow: WorkItem[]  = [];
  const upcoming: WorkItem[]  = [];
  const noDue: WorkItem[]     = [];

  for (const item of active) {
    if (!item.due_date) { noDue.push(item); continue; }
    const due = new Date(item.due_date);
    if (isOverdue(item.due_date, now)) { overdue.push(item); }
    else if (due < tomorrowStart) { today.push(item); }
    else if (due < day2Start)     { tomorrow.push(item); }
    else                          { upcoming.push(item); }
  }

  return { overdue, today, tomorrow, upcoming, noDue, done7d, doneOlder };
}

/** Fase F (auditoria): busca que ignora acento e caixa — "cafe" acha "Café". */
function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function casaPrazo(item: WorkItem, filtro: DueFilter, now: Date): boolean {
  if (filtro === 'none') return item.due_date == null;
  if (item.due_date == null) return false;
  if (filtro === 'overdue') return isOverdue(item.due_date, now);
  if (isOverdue(item.due_date, now)) return false;
  const due = new Date(item.due_date);
  if (filtro === 'today') return due < startOfDay(addDays(now, 1));
  return due < startOfDay(addDays(now, 7));
}

export function applyFilters(items: WorkItem[], f: TasksFilters, now: Date = new Date()): WorkItem[] {
  const termo = normalizarBusca(f.q).trim();
  const base  = items ?? [];
  const dueFiltro = f.due ?? 'all';

  return base.filter(item => {
    if (!f.done && item.status === 'done') return false;
    if (dueFiltro !== 'all' && !casaPrazo(item, dueFiltro, now)) return false;
    if (f.prio !== 'all' && item.priority !== f.prio) return false;
    if (f.contact !== null && item.contact?.id !== f.contact) return false;
    if (f.alarm && item.remind_at === null) return false;
    if (termo !== '' && !normalizarBusca(item.title).includes(termo)) return false;
    return true;
  });
}

export function temHora(iso: string | null): boolean {
  if (iso === null) return false;
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const fimDoDia = h === 23 && m >= 59;
  const meiaNoite = h === 0 && m === 0;
  return !fimDoDia && !meiaNoite;
}

export function agendaDayDots(
  day: { reminders: WorkItem[]; dueTasks: WorkItem[] },
  atrasadas: number,
): string[] {
  const dots: string[] = [];
  if (day.dueTasks.length > 0) dots.push('bg-primary');
  if (day.reminders.length > 0) dots.push('bg-warning');
  if (atrasadas > 0) dots.push('bg-destructive');
  return dots.slice(0, 3);
}

export interface AgendaDayGroups {
  alarmes: WorkItem[];
  prazos: WorkItem[];
  semHora: WorkItem[];
}

export function groupAgendaDay(day: { reminders: WorkItem[]; dueTasks: WorkItem[] }): AgendaDayGroups {
  const porAlarme = (a: WorkItem, b: WorkItem) => (a.remind_at ?? '').localeCompare(b.remind_at ?? '');
  const porPrazo  = (a: WorkItem, b: WorkItem) => (a.due_date ?? '').localeCompare(b.due_date ?? '');
  return {
    alarmes: [...day.reminders].sort(porAlarme),
    prazos:  day.dueTasks.filter(t => temHora(t.due_date)).sort(porPrazo),
    semHora: day.dueTasks.filter(t => !temHora(t.due_date)),
  };
}

export interface AgendaDayCounts {
  prazos: number;
  lembretes: number;
  atrasadas: number;
  semHora: number;
  total: number;
}

export function agendaDayCounts(
  day: { reminders: WorkItem[]; dueTasks: WorkItem[] },
  atrasadas = 0,
): AgendaDayCounts {
  const grupos = groupAgendaDay(day);
  const total = new Set([...grupos.alarmes, ...grupos.prazos, ...grupos.semHora].map(i => i.id)).size;
  return {
    prazos: day.dueTasks.length,
    lembretes: day.reminders.length,
    atrasadas,
    semHora: grupos.semHora.length,
    total,
  };
}

export function agendaDayAriaLabel(
  day: { reminders: WorkItem[]; dueTasks: WorkItem[] },
  atrasadas = 0,
): string {
  const { prazos, lembretes, atrasadas: atras } = agendaDayCounts(day, atrasadas);
  const partes: string[] = [];
  if (atras > 0) partes.push(`${atras} atrasada${atras === 1 ? '' : 's'}`);
  if (lembretes > 0) partes.push(`${lembretes} lembrete${lembretes === 1 ? '' : 's'}`);
  if (prazos > 0) partes.push(`${prazos} prazo${prazos === 1 ? '' : 's'}`);
  return partes.length > 0 ? partes.join(', ') : 'Nenhum compromisso';
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
  const leadTimes = done7d
    .filter(i => i.completed_at)
    .map(i => (new Date(i.completed_at!).getTime() - new Date(i.created_at).getTime()) / 86_400_000);
  return {
    overdue: overdue.length,
    dueToday: today.length,
    doingCount: doing.length,
    done7d: done7d.length,
    avgCycleTimeDays: cycleTimes.length > 0
      ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
      : null,
    avgLeadTimeDays: leadTimes.length > 0
      ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length
      : null,
  };
}

export function formatLeadTime(days: number | null | undefined): string {
  if (days == null || !Number.isFinite(days)) return '—';
  const arredondado = Math.round(days * 10) / 10;
  if (arredondado === 1) return '1 dia';
  const texto = Number.isInteger(arredondado) ? String(arredondado) : arredondado.toFixed(1);
  return texto.replace('.', ',') + ' dias';
}

export function dueLabel(
  dueDate: string,
  now: Date = new Date()
): { label: string; overdue: boolean } {
  const due          = new Date(dueDate);
  const tomorrowStart = startOfDay(addDays(now, 1));
  const day2Start    = startOfDay(addDays(now, 2));

  if (isOverdue(dueDate, now)) {
    const dist = formatDistanceToNowStrict(due, { locale: ptBR, addSuffix: false });
    return { label: 'Atrasada ' + dist, overdue: true };
  }
  if (due < tomorrowStart) return { label: 'Hoje', overdue: false };
  if (due < day2Start)     return { label: 'Amanha', overdue: false };

  const dayName  = due.toLocaleDateString('pt-BR', { weekday: 'short' });
  const dayMonth = due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return { label: dayName.replace('.', '') + ' ' + dayMonth, overdue: false };
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
  subtitle: string;
  dateKey: string | null;
}

export function daySubtitle(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  const texto = format(d, "EEEE, d 'de' MMMM", { locale: ptBR });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function dayGroupLabel(dueDate: string, now: Date = new Date()): string {
  const due           = new Date(dueDate);
  const tomorrowStart = startOfDay(addDays(now, 1));
  const day2Start     = startOfDay(addDays(now, 2));
  const sevenDayLimit = startOfDay(addDays(now, 7));

  if (isOverdue(dueDate, now)) return 'Atrasada';
  if (due < tomorrowStart) return 'Hoje';
  if (due < day2Start)     return 'Amanhã';

  const dueDay = startOfDay(due);
  if (isBefore(sevenDayLimit, dueDay)) return 'Semana que vem';

  const dayName  = due.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  const dayMonth = due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return dayName.charAt(0).toUpperCase() + dayName.slice(1) + ' ' + dayMonth;
}

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
    else groups.push({
      label,
      items: [item],
      subtitle: daySubtitle(item.due_date!),
      dateKey: localDayKey(item.due_date!),
    });
  }
  return groups;
}

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

function memoLast<A extends readonly unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let cache: { args: A; result: R } | null = null;
  return (...args: A): R => {
    if (cache && cache.args.length === args.length && cache.args.every((a, i) => Object.is(a, args[i]))) {
      return cache.result;
    }
    const result = fn(...args);
    cache = { args, result };
    return result;
  };
}

export const memoizedApplyFilters = memoLast(
  (items: WorkItem[], f: TasksFilters): WorkItem[] => applyFilters(items, f),
);

export const memoizedBucketByDue = memoLast(
  (items: WorkItem[], now?: Date): BucketsByDue => bucketByDue(items, now),
);

export const memoizedBucketByStatus = memoLast(
  (items: WorkItem[]): Record<WorkItemStatus, WorkItem[]> => bucketByStatus(items),
);

export const memoizedKpis = memoLast(
  (items: WorkItem[], now?: Date): KpiSnapshot => kpis(items, now),
);
