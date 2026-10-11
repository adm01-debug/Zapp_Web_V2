/**
 * `AnimatedNumber` — número que conta até o valor com mola.
 *
 * Regras (as mesmas do contador oficial do repo, `useCountUp`): parte do valor
 * que já está na tela e **fecha no valor exato** — nada de parar em "quase 42";
 * com `prefers-reduced-motion: reduce` o valor final aparece na hora, sem pedir
 * quadro de animação.
 */
import { useEffect, useRef, useState } from 'react';
import { animate, useMotionValue, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { zappSpring } from '@/lib/motion';
import { formatMotionNumber } from './tone';

export interface AnimatedNumberProps {
  value: number;
  /** Casas decimais exibidas (pt-BR). Fração é informação: não arredonda sozinho. */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  'data-testid'?: string;
}

export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
  'data-testid': testId = 'animated-number',
}: AnimatedNumberProps) {
  const reduce = useReducedMotion() ?? false;
  const motionValue = useMotionValue(reduce ? value : 0);
  const [shown, setShown] = useState(reduce ? value : 0);
  /** Ponto de partida da próxima contagem: o número não pode cair e subir de novo. */
  const shownRef = useRef(shown);

  useEffect(() => {
    const unsubscribe = motionValue.on('change', (v) => {
      shownRef.current = v;
      setShown(v);
    });
    return unsubscribe;
  }, [motionValue]);

  useEffect(() => {
    if (reduce) return; // sem contagem: o render já entrega o valor final
    const controls = animate(motionValue, value, zappSpring.soft);
    return () => controls.stop();
  }, [value, reduce, motionValue]);

  // Com movimento reduzido o número não "anda": mostra o valor final na hora.
  const exibido = reduce ? value : shown;

  return (
    <span
      data-testid={testId}
      data-motion={reduce ? 'reduced' : 'full'}
      className={cn('tabular-nums', className)}
    >
      {prefix}
      {formatMotionNumber(exibido, decimals)}
      {suffix}
    </span>
  );
}
