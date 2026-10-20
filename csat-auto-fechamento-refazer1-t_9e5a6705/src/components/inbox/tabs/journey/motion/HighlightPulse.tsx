/**
 * J05 — `HighlightPulse`: realce de CHEGADA do episódio aberto pelo clique
 * (mensagem, nota, tarefa…). Um anel/brilho na cor do token (D02) pulsa duas
 * vezes em 1,5 s e some. Com `prefers-reduced-motion: reduce` é um destaque
 * estático que some no mesmo prazo. Em ambos os casos `onDone` avisa o fim para
 * quem clicou guardar o estado. É decorativo: `aria-hidden`,
 * `pointer-events-none` e nunca cobre o clique (o cartão continua clicável).
 */
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { GlowToken } from './presets';

/** Prazo do realce (2 pulsos), em ms. */
export const HIGHLIGHT_DURATION_MS = 1500;

/**
 * Anel estático do realce — decorativo, por isso só esta cor muda por token:
 * são tokens do sistema, sem cor nova.
 */
const ANEL_POR_TOKEN: Record<GlowToken, string> = {
  primary: 'ring-2 ring-primary/60 bg-primary/10',
  success: 'ring-2 ring-success/60 bg-success/10',
  warning: 'ring-2 ring-warning/60 bg-warning/10',
  info: 'ring-2 ring-info/60 bg-info/10',
  muted: 'ring-2 ring-muted-foreground/40 bg-muted/40',
};

export interface HighlightPulseProps {
  /** `true` quando este é o episódio de destino do clique. */
  active: boolean;
  /** Avisa que o realce terminou (1,5 s) — o chamador desliga `active`. */
  onDone?: () => void;
  /** Cor da categoria do episódio. */
  token?: GlowToken;
  className?: string;
}

export function HighlightPulse({ active, onDone, token = 'primary', className }: HighlightPulseProps) {
  const reduzido = useReducedMotion();
  const [encerrado, setEncerrado] = useState(false);
  const avisar = useRef(onDone);

  // mantém o aviso atual sem reiniciar a contagem quando o chamador troca a função
  useEffect(() => {
    avisar.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!active) return;
    // episódio clicado de novo: o realce volta a aparecer
    const reinicio = setTimeout(() => setEncerrado(false), 0);
    const fim = setTimeout(() => {
      setEncerrado(true);
      avisar.current?.();
    }, HIGHLIGHT_DURATION_MS);
    return () => {
      clearTimeout(reinicio);
      clearTimeout(fim);
    };
  }, [active]);

  if (!active || encerrado) return null;

  const anel = cn('pointer-events-none absolute inset-0 rounded-lg', ANEL_POR_TOKEN[token], className);

  if (reduzido) {
    return <span aria-hidden="true" data-testid="highlight-pulse" className={anel} />;
  }

  return (
    <motion.span
      aria-hidden="true"
      data-testid="highlight-pulse"
      className={anel}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.8, 0.25, 0.8, 0] }}
      transition={{
        duration: HIGHLIGHT_DURATION_MS / 1000,
        times: [0, 0.15, 0.5, 0.75, 1],
        ease: 'easeInOut',
      }}
    />
  );
}
