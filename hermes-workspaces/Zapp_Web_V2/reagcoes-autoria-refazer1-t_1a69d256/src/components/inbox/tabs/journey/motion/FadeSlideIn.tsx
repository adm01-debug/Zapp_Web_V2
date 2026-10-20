/**
 * J05 — `FadeSlideIn`: entrada em fade (opacidade 0 → 1) com deslize de 8 px,
 * escalonada por índice (60 ms por item, teto de 8 itens) e **uma vez só** por
 * elemento, quando ele entra na tela. Com `prefers-reduced-motion: reduce` não
 * existe animação: o filho já nasce no estado final (sem opacidade e sem
 * deslocamento) e nada de observador de tela é criado.
 */
import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { FADE_SLIDE_VIEWPORT, MOTION, fadeSlideDelay } from './presets';

/** Deslocamento de entrada, em px (toque leve, nunca "salto"). */
const DISTANCIA_PX = 8;

export interface FadeSlideInProps {
  children: ReactNode;
  /** Posição do item na lista: define o atraso escalonado (teto de 8 itens). */
  index?: number;
  className?: string;
}

export function FadeSlideIn({ children, index = 0, className }: FadeSlideInProps) {
  const reduzido = useReducedMotion();

  if (reduzido) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: DISTANCIA_PX }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={FADE_SLIDE_VIEWPORT}
      transition={{
        duration: MOTION.base / 1000,
        ease: MOTION.ease,
        delay: fadeSlideDelay(index) / 1000,
      }}
    >
      {children}
    </motion.div>
  );
}
