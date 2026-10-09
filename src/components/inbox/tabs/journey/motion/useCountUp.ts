/**
 * J05 — `useCountUp`: contagem animada para os números das estatísticas do
 * contato (S084/D12). `requestAnimationFrame`, 600 ms, ease-out, terminando no
 * valor **exato** (nada de "quase 42"); o quadro pendente é cancelado no
 * desmonte. Com `prefers-reduced-motion: reduce` o valor final aparece na hora,
 * sem pedir quadro nenhum.
 *
 * Duas regras que os números da tela exigem:
 *  - **a contagem parte do valor que já está na tela** (guardado num ref) e vai
 *    até o novo alvo: quando a estatística passa de 41 para 42 porque chegou uma
 *    mensagem, o número não pode cair para ~0 e subir de novo — isso esconderia
 *    informação;
 *  - **alvo inteiro conta inteiro**: os quadros intermediários são arredondados,
 *    então ninguém vê "523,47" onde cabe "523". O arredondamento não encosta no
 *    último quadro: o valor final é o alvo EXATO.
 *
 * É o gancho oficial da onda 2: o J04 tem a própria contagem local e passa a
 * usar este para os números pararem de contar de dois jeitos diferentes.
 */
import { useEffect, useRef, useState } from 'react';
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
  /** Último valor que ficou na tela: é o ponto de partida da próxima contagem. */
  const mostrado = useRef(0);

  useEffect(() => {
    if (imediato) {
      // sem animação o alvo aparece de uma vez; a próxima contagem (com
      // animação) tem de partir daqui, e não de zero.
      mostrado.current = target;
      return;
    }

    const partida = mostrado.current;
    const distancia = target - partida;
    const alvoInteiro = Number.isInteger(target);
    let quadro = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, Math.max(0, (agora - inicio) / duration));
      if (t >= 1) {
        // último quadro: o valor EXATO do alvo, sem arredondamento nenhum
        mostrado.current = target;
        setValor(target);
        return;
      }
      const bruto = partida + distancia * easeOutCubic(t);
      const valorDoQuadro = alvoInteiro ? Math.round(bruto) : bruto;
      mostrado.current = valorDoQuadro;
      setValor(valorDoQuadro);
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [target, duration, imediato]);

  return imediato ? target : valor;
}
