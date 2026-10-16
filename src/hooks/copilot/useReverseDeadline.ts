/**
 * CV-083, CV-084, CV-085 — Calculadora de prazo reverso.
 *
 * CV-083: dado o evento no campo D do BRINDE, calcula a data limite de pedido
 *   subtraindo as fases em dias úteis (seg–sex), respeitando feriados.
 * CV-084: sinaliza urgência quando restam ≤ 3 dias úteis.
 * CV-085: quando a data é impossível, sugere alternativa de entrega rápida.
 */
import { useCallback, useMemo } from 'react';

export interface DeadlinePhase {
  name: string;
  daysRequired: number;
}

export const DEFAULT_PHASES: DeadlinePhase[] = [
  { name: 'Aprovação de arte', daysRequired: 2 },
  { name: 'Gravação', daysRequired: 3 },
  { name: 'Produção', daysRequired: 5 },
  { name: 'Frete', daysRequired: 3 },
];

const TOTAL_DEFAULT_DAYS = DEFAULT_PHASES.reduce((s, p) => s + p.daysRequired, 0);

export interface DeadlineResult {
  eventDate: Date;
  latestOrderDate: Date;
  daysRemaining: number;
  isPossible: boolean;
  isUrgent: boolean;
  urgencyMessage?: string;
  impossibleAlternative?: string;
  phaseBreakdown: Array<{ phase: string; startDate: Date; endDate: Date }>;
}

export interface UseReverseDeadlineOptions {
  eventDate?: Date | null;
  phases?: DeadlinePhase[];
  holidays?: Date[];
}

/** Returns true if `d` is Saturday(6) or Sunday(0). */
function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/** Returns true if `d` matches any holiday (compare by day only). */
function isHoliday(d: Date, holidays: Date[]): boolean {
  return holidays.some(
    (h) =>
      h.getFullYear() === d.getFullYear() &&
      h.getMonth() === d.getMonth() &&
      h.getDate() === d.getDate(),
  );
}

/** Adds `businessDays` working days to `from`. */
function addBusinessDays(from: Date, businessDays: number, holidays: Date[]): Date {
  let current = new Date(from);
  let remaining = businessDays;
  while (remaining > 0) {
    current = new Date(current.getTime() + 86_400_000);
    if (!isWeekend(current) && !isHoliday(current, holidays)) {
      remaining--;
    }
  }
  return current;
}

/** Subtracts `businessDays` working days from `from`. */
function subtractBusinessDays(from: Date, businessDays: number, holidays: Date[]): Date {
  let current = new Date(from);
  let remaining = businessDays;
  while (remaining > 0) {
    current = new Date(current.getTime() - 86_400_000);
    if (!isWeekend(current) && !isHoliday(current, holidays)) {
      remaining--;
    }
  }
  return current;
}

/** Count business days between two dates (from is earlier). */
function countBusinessDays(from: Date, to: Date, holidays: Date[]): number {
  let count = 0;
  let current = new Date(from);
  while (current < to) {
    current = new Date(current.getTime() + 86_400_000);
    if (!isWeekend(current) && !isHoliday(current, holidays)) {
      count++;
    }
  }
  return count;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function calculateDeadline(
  eventDate: Date,
  phases: DeadlinePhase[],
  holidays: Date[],
): DeadlineResult {
  const totalDays = phases.reduce((s, p) => s + p.daysRequired, 0);
  const latestOrderDate = subtractBusinessDays(startOfDay(eventDate), totalDays, holidays);
  const today = startOfDay(new Date());
  const daysRemaining = countBusinessDays(today, latestOrderDate, holidays);
  const isPossible = latestOrderDate >= today;
  const isUrgent = isPossible && daysRemaining <= 3;

  // Build phase breakdown (forward from latestOrderDate)
  const phaseBreakdown: Array<{ phase: string; startDate: Date; endDate: Date }> = [];
  let cursor = new Date(latestOrderDate);
  for (const phase of phases) {
    const start = new Date(cursor);
    const end = addBusinessDays(cursor, phase.daysRequired, holidays);
    phaseBreakdown.push({ phase: phase.name, startDate: start, endDate: end });
    cursor = end;
  }

  const urgencyMessage = isUrgent
    ? `Atenção: restam apenas ${daysRemaining} dia${daysRemaining === 1 ? '' : 's'} útil${daysRemaining === 1 ? '' : 'eis'} para fechar o pedido!`
    : undefined;

  const impossibleAlternative = !isPossible
    ? 'Considere produtos com entrega expressa (3–5 dias úteis) ou kits prontos sem personalização.'
    : undefined;

  return {
    eventDate,
    latestOrderDate,
    daysRemaining: Math.max(0, daysRemaining),
    isPossible,
    isUrgent,
    urgencyMessage,
    impossibleAlternative,
    phaseBreakdown,
  };
}

export interface UseReverseDeadlineReturn {
  deadline: DeadlineResult | null;
  calculate: (eventDate: Date) => DeadlineResult;
  totalProductionDays: number;
}

export function useReverseDeadline(
  options: UseReverseDeadlineOptions = {},
): UseReverseDeadlineReturn {
  const {
    eventDate = null,
    phases = DEFAULT_PHASES,
    holidays = [],
  } = options;

  const totalProductionDays = useMemo(
    () => phases.reduce((s, p) => s + p.daysRequired, 0),
    [phases],
  );

  const calculate = useCallback(
    (date: Date): DeadlineResult => calculateDeadline(date, phases, holidays),
    [phases, holidays],
  );

  const deadline = useMemo<DeadlineResult | null>(() => {
    if (!eventDate) return null;
    return calculateDeadline(eventDate, phases, holidays);
  }, [eventDate, phases, holidays]);

  return { deadline, calculate, totalProductionDays };
}

// Re-export for convenience
export { TOTAL_DEFAULT_DAYS };
