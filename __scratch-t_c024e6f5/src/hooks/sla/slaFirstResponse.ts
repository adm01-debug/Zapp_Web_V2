/**
 * Elegibilidade e denominador ÚNICOS do SLA de 1ª resposta (R2-SLA-001 / #458).
 *
 * O painel (`useSLAMetrics`) e o histórico (`useSLAHistory`) mediam populações diferentes: o painel
 * deixava as conversas PENDENTES fora do denominador da taxa e o histórico as contava como "no
 * prazo". Com dez registros — um respondido fora do prazo e nove pendentes — o painel dizia 0% e o
 * histórico 90%, sem nenhuma mudança no dado. A regra passa a viver aqui, num lugar só:
 *
 *   - AVALIADA: conversa com desfecho de 1ª resposta (violada ou respondida no prazo);
 *   - PENDENTE: sem desfecho — não é "no prazo" e não entra no denominador;
 *   - TAXA: `no prazo / avaliadas`; sem nenhuma avaliada NÃO existe taxa (nunca 100%).
 */

/** Campos de `conversation_sla` que decidem a elegibilidade da conversa. */
export interface FirstResponseFields {
  first_response_breached: boolean | null;
  first_response_at: string | null;
}

export type FirstResponseOutcome = 'on_time' | 'breached' | 'pending';

/**
 * Desfecho de 1ª resposta de uma linha. A violação manda: o escritor canônico grava
 * `first_response_breached` junto com o carimbo da resposta, e há linha violada sem carimbo
 * (é a evidência do próprio achado). Só é pendente quem não tem violação nem carimbo.
 */
export function classifyFirstResponse(row: FirstResponseFields): FirstResponseOutcome {
  if (row.first_response_breached) return 'breached';
  if (row.first_response_at) return 'on_time';
  return 'pending';
}

export interface FirstResponseTally {
  /** Conversas com desfecho: `onTime + breached` — é o denominador da taxa. */
  evaluated: number;
  onTime: number;
  breached: number;
  /** Conversas sem desfecho: fora do numerador E do denominador. */
  pending: number;
}

export function emptyFirstResponseTally(): FirstResponseTally {
  return { evaluated: 0, onTime: 0, breached: 0, pending: 0 };
}

/** Conta uma lista de conversas pelo desfecho de 1ª resposta. */
export function tallyFirstResponse(rows: FirstResponseFields[]): FirstResponseTally {
  const tally = emptyFirstResponseTally();
  for (const row of rows) {
    const desfecho = classifyFirstResponse(row);
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
export function sumFirstResponseTallies(tallies: FirstResponseTally[]): FirstResponseTally {
  return tallies.reduce(
    (acc, t) => ({
      evaluated: acc.evaluated + t.evaluated,
      onTime: acc.onTime + t.onTime,
      breached: acc.breached + t.breached,
      pending: acc.pending + t.pending,
    }),
    emptyFirstResponseTally()
  );
}

/**
 * Taxa de 1ª resposta no prazo SOBRE AS CONVERSAS AVALIADAS, em porcentagem.
 *
 * `null` quando não há nenhuma conversa avaliada (sem amostra): a taxa não existe. `100` afirmaria
 * SLA perfeito sem nenhuma resposta avaliada e `0` afirmaria o inverso — os dois lados do painel
 * diziam `100` e o achado chama isso de desempenho perfeito sem respostas avaliadas. Quem consome
 * distingue o caso por `evaluated` (ou por `hasSample`, onde o payload expõe).
 */
export function firstResponseRatePct(tally: FirstResponseTally): number | null {
  return tally.evaluated > 0 ? (tally.onTime / tally.evaluated) * 100 : null;
}

/**
 * A taxa como número para as telas que formatam (`toFixed`, `Math.round`, `Progress`), que hoje
 * estão fora desta área: sem amostra vale 0 — nunca 100.
 */
export function firstResponseRatePctOrZero(tally: FirstResponseTally): number {
  return firstResponseRatePct(tally) ?? 0;
}
