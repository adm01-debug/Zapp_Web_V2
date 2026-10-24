import { isSameDay } from 'date-fns';

/**
 * Janela (ms) em que mensagens do MESMO remetente continuam no mesmo grupo
 * visual. A V3 usa ate 5 min: passou disso, comeca um novo cabecalho de grupo
 * (avatar + nome voltam a aparecer).
 */
export const JANELA_AGRUPAMENTO_MS = 5 * 60_000;

/** O minimo que a regra de agrupamento precisa de uma mensagem. */
export interface MensagemAgrupavel {
  sender?: string | null;
  timestamp?: Date | string | number | null;
}

/** Converte o timestamp para Date; `null`/`undefined`/`Invalid Date` viram null. */
function paraData(valor: MensagemAgrupavel['timestamp']): Date | null {
  if (valor === null || valor === undefined) return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * Duas mensagens consecutivas entram no mesmo grupo quando:
 *   - sao do mesmo remetente;
 *   - as DUAS tem timestamp valido (`null`/`Invalid Date` nunca agrupa);
 *   - caem no mesmo dia do calendario (a virada de dia quebra o grupo);
 *   - a distancia entre elas nao passa de `janelaMs`.
 *
 * O parametro `prev` pode ser `undefined` (primeira mensagem da lista): nesse
 * caso nao ha grupo anterior e o retorno e `false`.
 */
export function agrupaComJanela(
  prev: MensagemAgrupavel | undefined | null,
  atual: MensagemAgrupavel | undefined | null,
  janelaMs: number = JANELA_AGRUPAMENTO_MS,
): boolean {
  if (!prev || !atual) return false;
  if (prev.sender !== atual.sender) return false;

  const anterior = paraData(prev.timestamp);
  const seguinte = paraData(atual.timestamp);
  if (!anterior || !seguinte) return false;
  if (!isSameDay(anterior, seguinte)) return false;

  return Math.abs(seguinte.getTime() - anterior.getTime()) <= janelaMs;
}
