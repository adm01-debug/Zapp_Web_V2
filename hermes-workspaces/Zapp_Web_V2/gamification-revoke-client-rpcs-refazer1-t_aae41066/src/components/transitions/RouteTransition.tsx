import { ReactNode, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { SlideDirection, TransitionConfig, TransitionVariantName } from './transitionVariants';
import { resolveTransition } from './transitionConfig';
import { useTransitionPreferences } from './useTransitionPreferences';

/**
 * SL-103A — a entrada de rota é animação CSS do tema (`animate-fade-in`,
 * `animate-slide-*` e `animate-scale-in` de tailwind.config.ts), sempre com
 * `motion-safe:`: quem pede movimento reduzido não recebe animação de rota nenhuma e
 * a rota entra direto no estado final. Antes isso vinha do runtime de animação por JS,
 * que era carregado no pacote inicial do app.
 *
 * O token do tema descreve o SENTIDO do movimento, enquanto `direction` da
 * configuração descreve de ONDE a rota vem — a tabela cruza os dois: a rota que vem da
 * direita anda para a esquerda (`animate-slide-left`) e a que vem de cima desce
 * (`animate-slide-down`).
 */
const ENTRADA_POR_DIRECAO: Record<SlideDirection, string> = {
  left: 'motion-safe:animate-slide-right',
  right: 'motion-safe:animate-slide-left',
  up: 'motion-safe:animate-slide-down',
  down: 'motion-safe:animate-slide-up',
};

const ENTRADA_POR_VARIANTE: Record<TransitionVariantName, string> = {
  none: '',
  fade: 'motion-safe:animate-fade-in',
  zoom: 'motion-safe:animate-scale-in',
  flip: 'motion-safe:animate-scale-in',
  parallax: 'motion-safe:animate-slide-up',
  // `slide` depende da direção: ver ENTRADA_POR_DIRECAO.
  slide: '',
};

function animacaoDeEntrada(config: TransitionConfig): string {
  if (config.variant === 'slide') return ENTRADA_POR_DIRECAO[config.direction ?? 'right'];
  return ENTRADA_POR_VARIANTE[config.variant];
}

/**
 * Estado estável do nó da rota depois da animação: a animação de entrada parte do
 * keyframe e devolve o nó a este transform (sem deslocamento/escala). Variantes que só
 * mexem em opacidade (`fade`/`none`) não declaram transform nenhum.
 */
function transformEstavel(config: TransitionConfig): string | undefined {
  switch (config.variant) {
    case 'slide': {
      const direcao = config.direction ?? 'right';
      return direcao === 'left' || direcao === 'right' ? 'translateX(0)' : 'translateY(0)';
    }
    case 'zoom':
    case 'flip':
      return 'scale(1)';
    case 'parallax':
      return 'translateY(0)';
    default:
      return undefined;
  }
}

interface RouteTransitionProps {
  children: ReactNode;
}

export function RouteTransition({ children }: RouteTransitionProps) {
  const location = useLocation();
  const { reducedMotion } = useTransitionPreferences();

  const config: TransitionConfig = useMemo(() => {
    if (reducedMotion) return { variant: 'none' };
    return resolveTransition(location.pathname);
  }, [location.pathname, reducedMotion]);

  const animacao = reducedMotion ? '' : animacaoDeEntrada(config);
  const transform = reducedMotion ? undefined : transformEstavel(config);

  return (
    <div
      key={location.pathname}
      className={cn('h-full w-full', animacao)}
      style={{ willChange: 'transform, opacity', height: '100%', transform }}
    >
      {children}
    </div>
  );
}
