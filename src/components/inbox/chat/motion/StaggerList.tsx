/**
 * `StaggerList` / `StaggerItem` — lista que entra em cascata.
 *
 * Uso no chat: resultados de busca, anexos, participantes. O pai escalona os
 * filhos (60 ms por item, teto de 8 — do 9º em diante entra junto, senão a lista
 * demora a ficar inteira) com a mola `soft`; cada item sobe `distance.small`.
 * O atraso de cada item sai de `zappStaggerDelaySeconds` (a regra, com o teto,
 * mora em `src/lib/motion.ts`) — o filho só sabe a sua posição na lista.
 *
 * Com `prefers-reduced-motion: reduce` a lista nasce inteira: o pai não anima e
 * cada item não recebe variante — nada fica invisível esperando a vez.
 */
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { cn } from '@/lib/utils';
import { zappMotion, zappStaggerDelaySeconds, zappTransition } from '@/lib/motion';

export interface StaggerListProps {
  children: ReactNode;
  className?: string;
}

export interface StaggerItemProps {
  children: ReactNode;
  className?: string;
  /** Posição na lista (0-based). O `StaggerList` preenche; o teto corta o atraso. */
  index?: number;
}

export function StaggerList({ children, className }: StaggerListProps) {
  const reduce = useReducedMotion() ?? false;
  const container: Variants = {
    hidden: { opacity: 1 },
    visible: { opacity: 1 },
  };

  return (
    <motion.div
      data-testid="stagger-list"
      data-motion={reduce ? 'reduced' : 'full'}
      variants={container}
      initial={reduce ? false : 'hidden'}
      animate="visible"
      className={cn(className)}
    >
      {Children.map(children, (filho, indice) =>
        isValidElement(filho) && filho.type === StaggerItem
          ? cloneElement(filho as ReactElement<StaggerItemProps>, { index: indice })
          : filho,
      )}
    </motion.div>
  );
}

export function StaggerItem({ children, className, index = 0 }: StaggerItemProps) {
  const reduce = useReducedMotion() ?? false;
  const atraso = reduce ? 0 : zappStaggerDelaySeconds(index);
  const item: Variants = {
    hidden: { opacity: 0, y: zappMotion.distance.small },
    visible: { opacity: 1, y: 0, transition: { ...zappTransition.normal, delay: atraso } },
  };

  return (
    <motion.div
      data-testid="stagger-item"
      data-motion={reduce ? 'reduced' : 'full'}
      data-delay-ms={Math.round(atraso * 1000)}
      variants={reduce ? undefined : item}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
