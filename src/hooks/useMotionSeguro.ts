import { useReducedMotion } from 'framer-motion';

/**
 * T75 - um unico lugar decide se a animacao roda.
 *
 * O aceite da etapa e: com `prefers-reduced-motion: reduce`, a transicao tem de ser 0s.
 * Centralizar evita o problema classico (cinco componentes, cada um lembrando ou nao de
 * consultar a preferencia). Aqui quem esquece nao anima: o repouso e o default.
 */
export interface MotionSeguro {
  /** false = usuario pediu menos movimento: nada anima. */
  anima: boolean;
  /** Duracao efetiva em segundos (0 quando reduzido), ja no formato do framer-motion. */
  duracao: (ms: number) => number;
  /** Stagger do plano: `i * 0.03` com teto de 5 itens (o resto entra junto, sem fila). */
  atraso: (indice: number) => number;
}

export function useMotionSeguro(): MotionSeguro {
  const prefereReduzir = useReducedMotion() ?? false;
  const anima = !prefereReduzir;
  return {
    anima,
    duracao: (ms) => (anima ? ms / 1000 : 0),
    atraso: (indice) => (anima ? Math.min(indice, 4) * 0.03 : 0),
  };
}
