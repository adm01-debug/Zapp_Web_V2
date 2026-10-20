import { SPEED_PROFILES } from './talkxShared';

/**
 * Conversões e validação dos limites de envio (X006).
 *
 * O banco guarda os intervalos em milissegundos, mas o modal "Editar limites"
 * (tela 12) exibe e recebe segundos. Estas funções puras centralizam a
 * conversão ms↔s, o intervalo do perfil de velocidade e o piso/teto.
 */

/** Piso (s) e teto (s) do intervalo entre envios. */
export const LIMITS_MIN_S = 3;
export const LIMITS_MAX_S = 600;

/** Milissegundos (banco) → segundos (exibição/edição). */
export function msToSeconds(ms: number): number {
  return Math.round(ms / 1000);
}

/** Segundos (exibição/edição) → milissegundos (banco). */
export function secondsToMs(s: number): number {
  return Math.round(s * 1000);
}

/** Intervalo [min, max] do perfil de velocidade, em milissegundos. */
export function intervalForProfile(profile: string): [number, number] {
  const found = SPEED_PROFILES.find((sp) => sp.value === profile);
  const [minS, maxS] = found ? found.interval : [8, 20];
  return [secondsToMs(minS), secondsToMs(maxS)];
}

/** O intervalo digitado (segundos) respeita o piso de 3 s e o teto de 600 s. */
export function isValidIntervalSeconds(s: number): boolean {
  return Number.isFinite(s) && s >= LIMITS_MIN_S && s <= LIMITS_MAX_S;
}
