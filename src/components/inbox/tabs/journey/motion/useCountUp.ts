/**
 * J05 — `useCountUp`: contagem animada para os números das estatísticas do
 * contato (S084/D12). `requestAnimationFrame`, 600 ms, ease-out, terminando no
 * valor **exato** (nada de "quase 42"); o quadro pendente é cancelado no
 * desmonte. Com `prefers-reduced-motion: reduce` o valor final aparece na hora,
 * sem pedir quadro nenhum.
 *
 * É o gancho oficial da onda 2: o J04 tem a própria contagem local e passa a
 * usar este para os números pararem de contar de dois jeitos diferentes.
 */
import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/** Duração padrão da contagem, em ms. */
export const COUNT_UP_DURATION_MS = 600;

/** ease-out cúbico: quase todo o caminho é percorrido no começo. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Valor animado até `target`.
 *
 * @param target valor final (pode ser negativo ou fracionário)
 * @param duration duração em ms (0 ou menos entrega o valor final na hora)
 */
export function useCountUp(target: number, duration: number = COUNT_UP_DURATION_MS): number {
  const reduzido = useReducedMotion();
  const imediato = reduzido || !(duration > 0);
  const [valor, setValor] = useState(0);

  useEffect(() => {
    if (imediato) return;
    let quadro = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, Math.max(0, (agora - inicio) / duration));
      setValor(t >= 1 ? target : target * easeOutCubic(t));
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [target, duration, imediato]);

  return imediato ? target : valor;
}
