/**
 * Elegibilidade, denominador e taxa do SLA de RESOLUÇÃO.
 *
 * Espelho de `slaFirstResponse.ts` (R2-SLA-001) para o desfecho de resolução: a
 * mesma decisão "avaliada x pendente" que o painel usa na 1ª resposta vale aqui,
 * num lugar só. A resolução mora em `conversation_sla` (`resolution_breached`,
 * `resolved_at`) — as colunas já existem no banco (migration 20251215173646) e
 * o painel simplesmente não as lia (auditoria de paridade V3 -> V2, parte 7).
 *
 *   - AVALIADA: conversa com desfecho de resolução (violada ou resolvida no prazo);
 *   - PENDENTE: sem desfecho — não é "no prazo" e não entra no denominador;
 *   - TAXA: `no prazo / avaliadas`; sem nenhuma avaliada NÃO existe taxa (nunca 100%).
 */

/** Campos de `conversation_sla` que decidem a elegibilidade da resolução. */
export interface ResolutionFields {
  resolution_breached: boolean | null;
  resolved_at: string | null;
}

export type ResolutionOutcome = 'on_time' | 'breached' | 'pending';

/**
 * Desfecho de resolução de uma linha. A violação manda (é o carimbo canônico do
 * banco): só é pendente quem não tem violação nem carimbo de resolução.
 */
export function classifyResolution(row: ResolutionFields): ResolutionOutcome {
  if (row.resolution_breached) return 'breached';
  if (row.resolved_at) return 'on_time';
  return 'pending';
}

export interface ResolutionTally {
  /** Conversas com desfecho: `onTime + breached` — é o denominador da taxa. */
  evaluated: number;
  onTime: number;
  breached: number;
  /** Conversas sem desfecho: fora do numerador E do denominador. */
  pending: number;
}

export function emptyResolutionTally(): ResolutionTally {
  return { evaluated: 0, onTime: 0, breached: 0, pending: 0 };
}

/** Conta uma lista de conversas pelo desfecho de resolução. */
export function tallyResolution(rows: ResolutionFields[]): ResolutionTally {
  const tally = emptyResolutionTally();
  for (const row of rows) {
    const desfecho = classifyResolution(row);
    if (desfecho === 'breached') {
      tally.breached++;
      tally.evaluated++;
    } else if (desfecho === 'on_time') {
      tally.onTime++;
      tally.evaluated++;
    } else {
      tally.pending++;
    }
  }
  return tally;
}

/** Soma tallies já calculados (dia a dia, agente a agente) sem recalcular o desfecho. */
export function sumResolutionTallies(tallies: ResolutionTally[]): ResolutionTally {
  return tallies.reduce(
    (acc, t) => ({
      evaluated: acc.evaluated + t.evaluated,
      onTime: acc.onTime + t.onTime,
      breached: acc.breached + t.breached,
      pending: acc.pending + t.pending,
    }),
    emptyResolutionTally()
  );
}

/**
 * Taxa de resolução no prazo SOBRE AS CONVERSAS AVALIADAS, em porcentagem.
 *
 * `null` quando não há nenhuma conversa avaliada (sem amostra): a taxa não
 * existe. `100` afirmaria SLA perfeito sem nenhuma resolução avaliada.
 */
export function resolutionRatePct(tally: ResolutionTally): number | null {
  return tally.evaluated > 0 ? (tally.onTime / tally.evaluated) * 100 : null;
}

/** A taxa como número para as telas que formatam (`toFixed`, `Math.round`). */
export function resolutionRatePctOrZero(tally: ResolutionTally): number {
  return resolutionRatePct(tally) ?? 0;
}
