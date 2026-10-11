/**
 * `PopBurst` — celebração curta: check ou estrela com anéis que se abrem.
 *
 * Uso no chat: "tudo lido", mensagem agendada, etiqueta aplicada. É a resposta
 * visual de uma ação que deu certo — por isso a cor é do token de estado
 * (`tone`, normalmente `success`). Decorativo: `aria-hidden`,
 * `pointer-events-none`; quem usa leitor de tela recebe a confirmação por texto
 * (toast/`role="status"`), não pelos anéis.
 *
 * Com `prefers-reduced-motion: reduce` os anéis só apagam a opacidade — nada de
 * abrir/escalar (o efeito continua, o movimento não).
 */
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { zappMotion, zappSpring } from '@/lib/motion';
import { toneClasses, type MotionTone } from './tone';

/** Prazo da celebração, em ms. */
export const POP_BURST_MS = 700;

export interface PopBurstProps {
  kind?: 'check' | 'star';
  tone?: MotionTone;
  active?: boolean;
  durationMs?: number;
  onDone?: () => void;
  className?: string;
}

export function PopBurst({
  kind = 'check',
  tone = 'success',
  active = true,
  durationMs = POP_BURST_MS,
  onDone,
  className,
}: PopBurstProps) {
  const reduce = useReducedMotion() ?? false;
  const classes = toneClasses(tone);
  const [encerrado, setEncerrado] = useState(false);
  const notify = useRef(onDone);

  useEffect(() => {
    notify.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!active) return;
    // celebração disparada de novo: volta a aparecer
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

  // `active` manda: sem ativação não há anéis/ícone.
  const visible = active && !encerrado;

  if (!visible) return null;

  const Icon = kind === 'star' ? Star : Check;

  return (
    <span
      aria-hidden="true"
      data-testid="pop-burst"
      data-motion={reduce ? 'reduced' : 'full'}
      className={cn('pointer-events-none relative inline-flex items-center justify-center', className)}
    >
      {[0, 1].map((ring) => (
        <motion.span
          key={ring}
          data-testid={`pop-burst-ring-${ring}`}
          className={cn('absolute inset-0 rounded-full border-2', classes.border)}
          initial={reduce ? { opacity: 0.6 } : { opacity: 0.6, scale: 0.5 }}
          animate={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.6 }}
          transition={{
            duration: durationMs / 1000,
            delay: reduce ? 0 : ring * zappMotion.duration.fast,
            ease: zappMotion.ease.enter,
          }}
        />
      ))}
      <motion.span
        className={classes.text}
        initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={reduce ? { duration: 0 } : zappSpring.pop}
      >
        <Icon className="h-5 w-5" />
      </motion.span>
    </span>
  );
}
