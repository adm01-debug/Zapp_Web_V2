/**
 * `FlashRing` — anel de realce que se desfaz.
 *
 * Uso no chat: a mensagem/aba que acabou de receber o foco de um salto responde
 * com um anel na cor do token que se dissolve em `durationMs` e some — chama
 * atenção uma vez e sai da frente. É decorativo: `aria-hidden`,
 * `pointer-events-none`, nunca cobre o clique de dentro.
 *
 * Com `prefers-reduced-motion: reduce` o anel existe igual (é realce, não
 * movimento) e só apaga a opacidade — sem esticar/escalar.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { zappDurations, zappMotion } from '@/lib/motion';
import { toneClasses, type MotionTone } from './tone';

/** Prazo do realce, em ms — derivado de `zappDurations` (nada solto no kit). */
export const FLASH_RING_MS = zappDurations.flashRingSeconds * 1000;

export interface FlashRingProps {
  children?: ReactNode;
  /** `true` dispara o realce; cai para `false` sozinho no fim. */
  active?: boolean;
  tone?: MotionTone;
  /** Prazo do realce (ms) — encurtado nos testes. */
  durationMs?: number;
  /** Avisa que o realce terminou, para o chamador desligar `active`. */
  onDone?: () => void;
  className?: string;
}

export function FlashRing({
  children,
  active = true,
  tone = 'primary',
  durationMs = FLASH_RING_MS,
  onDone,
  className,
}: FlashRingProps) {
  const reduce = useReducedMotion() ?? false;
  const classes = toneClasses(tone);
  const [encerrado, setEncerrado] = useState(false);
  const notify = useRef(onDone);

  useEffect(() => {
    notify.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!active) return;
    // realce disparado de novo (mesmo elemento): volta a aparecer
    const reinicio = setTimeout(() => setEncerrado(false), 0);
    const done = setTimeout(() => {
      setEncerrado(true);
      notify.current?.();
    }, durationMs);
    return () => {
      clearTimeout(reinicio);
      clearTimeout(done);
    };
  }, [active, durationMs]);

  // `active` manda: sem ativação o anel não existe (nada de estado sincronizado no efeito).
  const visible = active && !encerrado;

  return (
    <span className={cn('relative inline-flex', className)}>
      {children}
      {visible ? (
        <motion.span
          aria-hidden="true"
          data-testid="flash-ring"
          data-motion={reduce ? 'reduced' : 'full'}
          className={cn('pointer-events-none absolute inset-0 rounded-[inherit] ring-2', classes.ring, classes.soft)}
          initial={reduce ? { opacity: 1 } : { opacity: 0.9, scale: 1 }}
          animate={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.08 }}
          transition={{ duration: durationMs / 1000, ease: zappMotion.ease.standard }}
        />
      ) : null}
    </span>
  );
}
