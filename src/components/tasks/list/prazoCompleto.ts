import { formatWorkItemDate } from '@/hooks/tasks/workItemFormat';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Etapa 057 — texto do tooltip da célula Prazo.
 *
 * Não inventa um segundo formato de data (D21): parte do rótulo da regra única
 * (`workItemFormat.ts`) e acrescenta o dia exato em dd/mm/aaaa —
 * "Hoje, 14:00 · 11/10/2026". Sem valor (ou valor inválido) devolve `null`, e a
 * célula não mostra tooltip.
 */
export function prazoCompleto(value: string | Date | null | undefined, now?: Date): string | null {
  const d = toDate(value);
  if (!d) return null;
  const rotulo = formatWorkItemDate(d, { now, format: 'datetime' });
  if (rotulo === null) return null;
  return `${rotulo} · ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
