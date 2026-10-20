import { addHours } from 'date-fns';

/**
 * Cálculo do vencimento de um adiamento (snooze) de conversa.
 *
 * Regra única e pura, compartilhada por quem adia (o hook
 * `useConversationActions` e o comando `/snooze`, que passa pelo mesmo hook),
 * para não existirem duas versões do "próxima semana".
 *
 * A V3 define:
 * - 'tomorrow' → amanhã às 09:00:00 (minutos/segundos/ms zerados);
 * - 'nextweek' → a PRÓXIMA segunda-feira às 09:00:00 (domingo conta como
 *   véspera: a segunda é amanhã, +1 dia; se hoje já é segunda, vai para +7;
 *   sexta +3, sábado +2).
 *
 * Antes, `nextweek` era `addDays(now, 7 - now.getDay() + 1)` + `setHours(9)`,
 * que no domingo (getDay()=0) somava 8 dias e caía na segunda SEGUINTE, e
 * mantinha os minutos/segundos da hora atual (09:37 em vez de 09:00).
 */

export const SNOOZE_DURATIONS = ['1h', '3h', 'tomorrow', 'nextweek'] as const;
export type SnoozeDuration = (typeof SNOOZE_DURATIONS)[number];

const SNOOZE_HOUR = 9;

/** Amanhã às 09:00:00.000 (hora local), independente da hora atual. */
function amanhaNove(now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(SNOOZE_HOUR, 0, 0, 0);
  return d;
}

/**
 * Próxima segunda-feira às 09:00:00.000 (hora local).
 * `getDay()`: domingo=0, segunda=1 … sábado=6. `(8 - getDay()) % 7 || 7` dá
 * exatamente o delta esperado (domingo→1, segunda→7, sexta→3, sábado→2) —
 * mesma fórmula já usada no módulo de tarefas (QuickAdd).
 */
function proximaSegundaNove(now: Date): Date {
  const delta = (8 - now.getDay()) % 7 || 7;
  const d = new Date(now);
  d.setDate(d.getDate() + delta);
  d.setHours(SNOOZE_HOUR, 0, 0, 0);
  return d;
}

/**
 * Vencimento do adiamento para a duração informada. Duração desconhecida cai
 * em '1h' (comportamento anterior preservado).
 */
export function snoozeDurationToDate(duration: string, now: Date = new Date()): Date {
  switch (duration) {
    case '1h':
      return addHours(now, 1);
    case '3h':
      return addHours(now, 3);
    case 'tomorrow':
      return amanhaNove(now);
    case 'nextweek':
      return proximaSegundaNove(now);
    default:
      return addHours(now, 1);
  }
}
