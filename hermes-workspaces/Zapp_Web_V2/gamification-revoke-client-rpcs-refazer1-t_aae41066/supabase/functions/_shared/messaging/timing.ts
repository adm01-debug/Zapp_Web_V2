/**
 * timing.ts — ritmo de envio do kernel de mensageria (F43).
 *
 * `randomBetween` e `sleep` nasceram DUPLICADOS em `talkx-send/index.ts` e
 * `multiplix-send/index.ts` (mesmo corpo nos dois arquivos). Foram movidos
 * VERBATIM para cá para existir UMA definição só: a humanização (sorteio do
 * intervalo e a pausa "digitando") não pode divergir em silêncio entre os dois
 * edges na próxima correção.
 *
 * Sem dependência de I/O nem de provedor — só aritmética e `setTimeout` — para
 * o kernel continuar testável sem rede.
 */

import { secureRandomFloat } from "../secure-random.ts";

/** Inteiro uniforme em [min, max], limites inclusive. */
export function randomBetween(min: number, max: number): number {
  return Math.floor(secureRandomFloat() * (max - min + 1)) + min;
}

/** Espera `ms` milissegundos antes do próximo passo do envio humanizado. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
