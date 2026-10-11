/**
 * `DrawLine` — traço que se desenha.
 *
 * Uso no chat: sublinhado de aba/segmento que aponta o destino do dado, régua de
 * tendência em card de resumo. O traçado pinta com `stroke-current` na cor do
 * token (`tone`), então nenhuma cor literal entra. `length` é o comprimento do
 * traço em unidades do `viewBox` (o jsdom não calcula `getTotalLength`, por isso
 * vem por prop) e é o que define o "desenhar". Com movimento reduzido o traço já
 * nasce pronto (offset 0), sem animação.
 */
import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { toneClasses, type MotionTone } from './tone';

export interface DrawLineProps {
  /** Traçado em sintaxe SVG (`d`). */
  d: string;
  /** Comprimento do traçado em unidades do `viewBox`. */
  length?: number;
  width?: number;
  height?: number;
  tone?: MotionTone;
  className?: string;
}

export function DrawLine({
  d,
  length = 100,
  width = 120,
  height = 24,
  tone = 'primary',
  className,
}: DrawLineProps) {
  const reduce = useReducedMotion() ?? false;
  const [offset, setOffset] = useState(reduce ? 0 : length);

  useEffect(() => {
    if (reduce) return; // traço já nasce pronto: nada de animar
    const frame = requestAnimationFrame(() => setOffset(0));
    return () => cancelAnimationFrame(frame);
  }, [reduce, length]);

  // Com movimento reduzido o offset é sempre 0 (traço completo) — sem quadro de animação.
  const deslocamento = reduce ? 0 : offset;

  return (
    <svg
      aria-hidden="true"
      data-testid="draw-line"
      data-motion={reduce ? 'reduced' : 'full'}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      fill="none"
      className={cn('overflow-visible', className)}
    >
      <path
        d={d}
        data-testid="draw-line-path"
        className={cn(toneClasses(tone).text, 'stroke-current')}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={length}
        strokeDashoffset={deslocamento}
        style={{ transitionDuration: reduce ? '0ms' : '320ms', transitionTimingFunction: 'ease-out' }}
      />
    </svg>
  );
}
