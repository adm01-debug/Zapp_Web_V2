/**
 * CV-083, CV-084, CV-085 — Calculador de prazo reverso em dias úteis.
 *
 * CV-083: dada a data do evento, calcula a data máxima de pedido
 *   subtraindo as fases de produção em dias úteis.
 * CV-084: sinaliza urgência quando o prazo limite estiver a 3 ou menos dias
 *   úteis (daysRemaining <= 3).
 * CV-085: quando a data do evento não comporta o prazo de produção,
 *   retorna `isPossible: false` e uma alternativa para o vendedor.
 */
import { useMemo } from 'react';

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

export const TOTAL_DEFAULT_DAYS = DEFAULT_PHASES.reduce((s, p) => s + p.daysRequired, 0);

export interface PhaseBreakdownItem {
  phase: string;
  startDate: Date;
  endDate: Date;
  daysRequired: number;
}

export interface DeadlineResult {
  latestOrderDate: Date;
  daysRemaining: number;
  isPossible: boolean;
  isUrgent: boolean;
  urgencyMessage?: string;
  impossibleAlternative?: string;
  phaseBreakdown: PhaseBreakdownItem[];
}

export interface UseReverseDeadlineOptions {
  eventDate?: Date;
  phases?: DeadlinePhase[];
}

/** Add `n` business days to `fromDate` (skips Sat/Sun). */
function addBusinessDays(fromDate: Date, n: number): Date {
  let d = new Date(fromDate);
  let count = 0;
  while (count < n) {
    d = new Date(d.getTime() + 86_400_000);
    if (d.getDay() !== 0 && d.getDay() !== 6) count++;
  }
  return d;
}

/** Subtract `n` business days from `fromDate` (skips Sat/Sun). */
function subtractBusinessDays(fromDate: Date, n: number): Date {
  let d = new Date(fromDate);
  let count = 0;
  while (count < n) {
    d = new Date(d.getTime() - 86_400_000);
    if (d.getDay() !== 0 && d.getDay() !== 6) count++;
  }
  return d;
}

/** Count business days between two dates (exclusive of start, inclusive of end). */
function countBusinessDays(fromDate: Date, toDate: Date): number {
  if (toDate <= fromDate) return 0;
  let d = new Date(fromDate);
  let count = 0;
  while (d < toDate) {
    d = new Date(d.getTime() + 86_400_000);
    if (d.getDay() !== 0 && d.getDay() !== 6) count++;
  }
  return count;
}

function calculateDeadline(
  eventDate: Date,
  phases: DeadlinePhase[],
): DeadlineResult {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalDays = phases.reduce((s, p) => s + p.daysRequired, 0);
  const latestOrderDate = subtractBusinessDays(eventDate, totalDays);

  const isPossible = latestOrderDate >= today;
  const daysRemaining = countBusinessDays(today, latestOrderDate);
  const isUrgent = isPossible && daysRemaining <= 3;

  // Build phase breakdown by walking backward from the event date
  const phaseBreakdown: PhaseBreakdownItem[] = [];
  let cursor = new Date(eventDate);
  for (let i = phases.length - 1; i >= 0; i--) {
    const phase = phases[i];
    const endDate = new Date(cursor);
    const startDate = subtractBusinessDays(cursor, phase.daysRequired);
    phaseBreakdown.unshift({
      phase: phase.name,
      startDate,
      endDate,
      daysRequired: phase.daysRequired,
    });
    cursor = startDate;
  }

  const localeOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };

  return {
    latestOrderDate,
    daysRemaining,
    isPossible,
    isUrgent,
    urgencyMessage: isUrgent
      ? `Atenção: pedido deve ser feito até ${latestOrderDate.toLocaleDateString('pt-BR', localeOpts)}!`
      : undefined,
    impossibleAlternative: !isPossible
      ? 'Sugera produto pronto ou entrega parcial para reduzir prazo de produção.'
      : undefined,
    phaseBreakdown,
  };
}

export function useReverseDeadline(options: UseReverseDeadlineOptions) {
  const { eventDate, phases = DEFAULT_PHASES } = options;

  const deadline = useMemo(() => {
    if (!eventDate) return null;
    return calculateDeadline(eventDate, phases);
  }, [eventDate, phases]);

  return { deadline };
}
