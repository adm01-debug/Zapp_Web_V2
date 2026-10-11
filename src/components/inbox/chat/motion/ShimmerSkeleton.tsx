/**
 * `ShimmerSkeleton` — brilho sutil de carregamento.
 *
 * É decorativo (`aria-hidden`): quem espera recebe a informação por texto/estado,
 * não pelo brilho. A luz usa só tokens (`--muted` no fundo e
 * `--muted-foreground` no reflexo). Com `prefers-reduced-motion: reduce` fica um
 * bloco estático, sem varrer.
 */
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface ShimmerSkeletonProps {
  /** Dimensões e cantos: `h-4 w-32 rounded-md`… */
  className?: string;
}

export function ShimmerSkeleton({ className }: ShimmerSkeletonProps) {
  const reduce = useReducedMotion() ?? false;
  return (
    <span
      aria-hidden="true"
      data-testid="shimmer-skeleton"
      data-motion={reduce ? 'reduced' : 'full'}
      className={cn('block overflow-hidden rounded-md bg-muted', !reduce && 'animate-shimmer', className)}
      style={
        reduce
          ? undefined
          : {
              backgroundImage:
                'linear-gradient(90deg, transparent, hsl(var(--muted-foreground) / 0.18), transparent)',
              backgroundSize: '200% 100%',
            }
      }
    />
  );
}
