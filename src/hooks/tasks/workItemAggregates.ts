import { isBefore, startOfDay, addDays, formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { WorkItem, WorkItemStatus } from './workItem.types';

export interface BucketsByDue {
  overdue: WorkItem[];
  today: WorkItem[];
  tomorrow: WorkItem[];
  upcoming: WorkItem[];
  noDue: WorkItem[];
  done7d: WorkItem[];
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

  const active = items.filter(i => i.status !== 'done' && i.status !== 'cancelled');
  const done7d = items.filter(i =>
    i.status === 'done' && i.completed_at != null &&
    new Date(i.completed_at) >= sevenDaysAgo
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

  return { overdue, today, tomorrow, upcoming, noDue, done7d };
}

export function bucketByStatus(items: WorkItem[]): Record<WorkItemStatus, WorkItem[]> {
  const out: Record<WorkItemStatus, WorkItem[]> = {
    backlog: [], todo: [], doing: [], waiting: [], done: [], cancelled: [],
  };
  for (const item of items) out[item.status].push(item);
  const w: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  for (const col of Object.values(out)) {
    col.sort((a, b) =>
      a.position - b.position ||
      (w[a.priority] ?? 2) - (w[b.priority] ?? 2) ||
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

export function weekBuckets(
  items: WorkItem[],
  startDate: Date
): Array<{ date: Date; reminders: WorkItem[]; dueTasks: WorkItem[] }> {
  return Array.from({ length: 7 }, (_, i) => {
    const day    = addDays(startDate, i);
    const dayStr = day.toISOString().slice(0, 10);
    return {
      date: day,
      reminders: items.filter(it =>
        it.remind_at &&
        it.remind_at.slice(0, 10) === dayStr &&
        it.status !== 'done' && it.status !== 'cancelled'
      ),
      dueTasks: items.filter(it =>
        it.due_date &&
        it.due_date.slice(0, 10) === dayStr &&
        it.status !== 'done' && it.status !== 'cancelled'
      ),
    };
  });
}
