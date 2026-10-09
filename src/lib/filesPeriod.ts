import type { AnalysisPeriod } from '@/components/inbox/ai-tools/PeriodFilterSelector';

/**
 * Filtro por DATA da aba Arquivos (plano de 07/10/2026, etapas F01–F06).
 *
 * Converte o período escolhido no `PeriodFilterSelector` (`AnalysisPeriod` + o intervalo
 * personalizado) num intervalo de instantes `[from, to]` no FUSO DO NAVEGADOR — o mesmo recorte
 * que a aba IA faz em `filterMessagesByPeriod`, para o operador ver a mesma coisa nas duas abas.
 * Nada aqui toca o banco: a lista já chega paginada por `created_at desc`.
 *
 * Regras do cartão:
 * - `all` (Qualquer data) = sem filtro (`null`);
 * - `custom` inclui o dia inicial e o dia final INTEIROS (00:00:00.000 .. 23:59:59.999 locais);
 * - intervalo invertido é normalizado (`from <= to`);
 * - data ausente/inválida fica FORA quando há período ativo.
 *
 * `last_interaction` não tem sentido para arquivos (a barra não oferece a opção) e, como não há
 * histórico de mensagens aqui, cai em "sem filtro" em vez de esconder a lista inteira.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mesma tabela de dias da IA: `today` conta do início do dia local (0 dias para trás). */
const PERIOD_DAYS: Partial<Record<AnalysisPeriod, number>> = {
  today: 0,
  '3d': 3,
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '90d': 90,
};

/**
 * Intervalo em epoch ms, INCLUSIVO nas duas pontas. `null` numa ponta = sem limite daquele lado
 * (só acontece no período personalizado com uma data só: "De 01/10" sem o "Até").
 */
export interface PeriodRange {
  from: number | null;
  to: number | null;
}

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function endOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

/** Início do dia local, ou `null` para data ausente/inválida (nunca `NaN` no intervalo). */
function dayStart(date: Date | null | undefined): number | null {
  if (!date) return null;
  const time = date.getTime();
  return Number.isFinite(time) ? startOfDay(time) : null;
}

/** Fim do dia local, ou `null` para data ausente/inválida. */
function dayEnd(date: Date | null | undefined): number | null {
  if (!date) return null;
  const time = date.getTime();
  return Number.isFinite(time) ? endOfDay(time) : null;
}

/** `created_at` -> epoch ms; `null` quando ausente ou inválido. */
function timeOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Período -> intervalo. `null` = sem filtro (Qualquer data, ou `custom` sem nenhuma data
 * escolhida). `now` é injetável só para o teste ser determinístico; em produção é o relógio.
 */
export function buildPeriodRange(
  period: AnalysisPeriod,
  customFrom?: Date | null,
  customTo?: Date | null,
  now: Date = new Date(),
): PeriodRange | null {
  if (period === 'all' || period === 'last_interaction') return null;

  if (period === 'custom') {
    const from = dayStart(customFrom);
    const to = dayEnd(customTo);
    if (from === null && to === null) return null;
    // Invertido (De depois do Até): normaliza para o intervalo crescer do menor para o maior dia.
    if (from !== null && to !== null && from > to) {
      return { from: dayStart(customTo), to: dayEnd(customFrom) };
    }
    return { from, to };
  }

  const days = PERIOD_DAYS[period];
  if (days === undefined) return null;
  // O teto é o fim do dia de hoje: o atalho é o intervalo de dias inteiros que ele nomeia
  // ("Hoje" = o dia de hoje, não "de hoje em diante"). Arquivo com data no futuro é dado
  // errado, e nem o filtro da IA o alcança.
  return { from: startOfDay(now.getTime() - days * DAY_MS), to: endOfDay(now.getTime()) };
}

/**
 * Recorte por `created_at`. Sem período ativo (`null`) devolve a MESMA lista; com período ativo,
 * item com data ausente/inválida fica FORA (não há como provar que ele pertence ao intervalo).
 */
export function filterByPeriod<T extends { created_at: string }>(
  items: T[],
  range: PeriodRange | null,
): T[] {
  if (!range) return items;
  return items.filter((item) => {
    const time = timeOf(item.created_at);
    if (time === null) return false;
    if (range.from !== null && time < range.from) return false;
    if (range.to !== null && time > range.to) return false;
    return true;
  });
}
