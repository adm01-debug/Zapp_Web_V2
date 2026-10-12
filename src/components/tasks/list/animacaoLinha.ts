/**
 * Etapa 072 — a entrada e a saída das LINHAS da Lista.
 *
 * Regras: entrada escalonada de até 40 ms por linha (as primeiras 12 linhas), e
 * a altura entra/sai junto com a opacidade — exceto em movimento reduzido, onde
 * a altura NÃO anima (só a opacidade, e sem atraso).
 *
 * Módulo puro para o teste provar o contrato sem depender do motor de animação.
 */
export const PASSO_ENTRADA_MS = 40;
export const MAX_PASSOS_ENTRADA = 12;

/** Configuração de `transition` da linha. */
export function transicaoDaLinha(reduceMotion: boolean, index: number) {
  if (reduceMotion) return { duration: 0 };
  return {
    duration: 0.15,
    delay: Math.min(index, MAX_PASSOS_ENTRADA) * (PASSO_ENTRADA_MS / 1000),
  };
}

/** Configuração de `initial`/`animate`/`exit` da linha. */
export function animacaoDaLinha(reduceMotion: boolean) {
  if (reduceMotion) {
    return { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
  }
  return {
    initial: { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0, height: 'auto' as const },
    exit: { opacity: 0, height: 0 },
  };
}
