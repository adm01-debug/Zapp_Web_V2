import type { AnalysisPeriod } from '@/components/inbox/ai-tools/PeriodFilterSelector';
import {
  isWithin,
  resolveLastDays,
  resolveRange,
  type JourneyRange,
} from '@/lib/journey/periodRange';
import { localDayKey } from '@/lib/localDay';

/**
 * Filtro por DATA da aba Arquivos (plano de 07/10/2026, etapas F01–F06) — desde o Z01 é um
 * ADAPTADOR FINO sobre `src/lib/journey/periodRange.ts`, a fonte única do cálculo de período do
 * sistema: neste arquivo só se traduz a API que o FilesTab usa (`AnalysisPeriod` + `Date` para
 * `JourneyPeriod`; `Date` para epoch ms) e a tabela de dias de cada atalho. Nenhuma conta de dia,
 * de borda ou de "dentro do intervalo" mora mais aqui. Nada toca o banco: a lista já chega paginada
 * por `created_at desc`.
 *
 * Regras (comportamento da aba Arquivos, preservado):
 * - `all` (Qualquer data) e `last_interaction` = sem filtro (`null`); `last_interaction` nem é
 *   oferecido aqui — não há histórico de mensagens nesta aba;
 * - `custom` inclui o dia inicial e o dia final INTEIROS, em qualquer ordem (invertido normaliza);
 *   data ausente/inválida conta como ausente;
 * - os atalhos cobrem o dia de hoje e os N dias anteriores (`today` = só hoje): é o mesmo recorte de
 *   `filterMessagesByPeriod` da aba IA (`startOfDay(agora − N dias)`) — em dias de CALENDÁRIO isso
 *   são N + 1. O atalho de mesmo nome do Journey cobre N dias (hoje e os N − 1 anteriores); a
 *   diferença de 1 dia entre as duas telas está fixada em
 *   `src/lib/__tests__/periodEquivalence.test.ts`;
 * - com período ativo, item com data ausente/inválida fica FORA.
 */

/**
 * Intervalo em epoch ms, INCLUSIVO nas duas pontas. `null` numa ponta = sem limite daquele lado
 * (só acontece no período personalizado com uma data só: "De 01/10" sem o "Até").
 */
export interface PeriodRange {
  from: number | null;
  to: number | null;
}

/** Quantos dias ATRÁS começa a janela de cada atalho da aba (0 = hoje). Tabela do F01, inalterada. */
const DIAS_ATRAS_POR_ATALHO: Partial<Record<AnalysisPeriod, number>> = {
  today: 0,
  '3d': 3,
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '90d': 90,
};

/** Intervalo do Journey -> API do FilesTab: aberto (ou ilegível) vira "sem filtro" (`null`). */
function paraPeriodRange(range: JourneyRange): PeriodRange | null {
  if (range.invalid || (!range.from && !range.to)) return null;
  return {
    from: range.from ? range.from.getTime() : null,
    to: range.to ? range.to.getTime() : null,
  };
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
  if (period === 'custom') {
    // `localDayKey` devolve `yyyy-MM-dd` local e `null` para data ausente/inválida — o mesmo
    // "data ilegível é campo vazio" desta aba. O intervalo inteiro (inclusive o invertido) é do
    // Journey.
    return paraPeriodRange(
      resolveRange(
        { preset: 'custom', from: localDayKey(customFrom) ?? undefined, to: localDayKey(customTo) ?? undefined },
        now,
      ),
    );
  }

  const diasAtras = DIAS_ATRAS_POR_ATALHO[period];
  // Atalho fora da tabela (`all`, `last_interaction`, valor desconhecido) não filtra.
  if (diasAtras === undefined) return null;
  // Hoje + os `diasAtras` dias anteriores = `diasAtras + 1` dias de calendário.
  return paraPeriodRange(resolveLastDays(diasAtras + 1, now));
}

/**
 * Recorte por `created_at`. Sem período ativo (`null`) devolve a MESMA lista; com período ativo,
 * item com data ausente/inválida fica FORA (não há como provar que ele pertence ao intervalo).
 * Quem decide o que cai dentro é o `isWithin` do Journey — o mesmo predicado do Histórico —, para
 * as duas telas nunca discordarem sobre uma data de fronteira.
 */
export function filterByPeriod<T extends { created_at: string }>(
  items: T[],
  range: PeriodRange | null,
): T[] {
  if (!range) return items;
  const bounds = {
    from: range.from === null ? null : new Date(range.from),
    to: range.to === null ? null : new Date(range.to),
  };
  return items.filter((item) => isWithin(item.created_at, bounds));
}
