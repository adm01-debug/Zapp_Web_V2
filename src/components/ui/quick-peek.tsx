import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface QuickPeekProps
  // `style`/`data-*`/`aria-*` vão para o wrapper (a linha da lista do
  // virtualizador precisa passar o posicionamento absoluto e o data-testid
  // dela para cá).
  extends Omit<React.ComponentPropsWithoutRef<'div'>, 'children' | 'onMouseEnter' | 'onMouseLeave'> {
  /** Content to show on hover */
  children: React.ReactNode;
  /** Preview content (e.g. last 3 messages) */
  preview: React.ReactNode;
  /** Whether peek is enabled */
  enabled?: boolean;
  /** Delay before showing preview in ms */
  delay?: number;
  /** Additional className for the wrapper */
  className?: string;
}

/** Distância entre a linha e o balão, em px. */
const BALLOON_GAP = 8;

/**
 * Dispositivo sem ponteiro preciso (celular/tablet): a pré-visualização por
 * hover não tem como ser acionada, então fica desligada. Lido no momento do
 * hover — não precisa de estado nem de re-render da linha.
 */
function isTouchOnlyDevice(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * QuickPeek — hover to see a preview tooltip (e.g. last messages in a thread)
 * without leaving the current context.
 *
 * O balão vai para um PORTAL em `document.body` (mesmo motivo do
 * TooltipContent em ui/tooltip.tsx): a linha da lista de conversas vive dentro
 * de containers com `overflow-hidden`/`overflow-x-hidden`, e a linha do
 * virtualizador tem `transform` (que vira containing block de conteúdo
 * `fixed`/`absolute`) — sem o portal o balão era cortado e nunca aparecia.
 * Com o portal a posição é calculada uma única vez, na abertura (fixed), sem
 * escutar mousemove nem re-renderizar a linha a cada movimento do mouse.
 */
export function QuickPeek({
  children,
  preview,
  enabled = true,
  delay = 400,
  className,
  ...wrapperProps
}: QuickPeekProps) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const handleEnter = () => {
    if (!enabled || isTouchOnlyDevice()) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const rect = wrapperRef.current?.getBoundingClientRect();
      setPosition({ top: rect?.top ?? 0, left: (rect?.right ?? 0) + BALLOON_GAP });
      setShow(true);
    }, delay);
  };

  const handleLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setShow(false);
  };

  // Desligar a prop (ex.: a conversa virou a selecionada) esconde o balão sem
  // precisar de estado extra: o que está na tela é derivado do render.
  const visible = show && enabled && position !== null;

  return (
    <div
      ref={wrapperRef}
      {...wrapperProps}
      className={cn('relative', className)}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {visible && (
              <motion.div
                data-testid="quick-peek"
                aria-hidden="true"
                initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.97 }}
                animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                style={{ position: 'fixed', top: position?.top ?? 0, left: position?.left ?? 0 }}
                className={cn(
                  'z-50 w-72 max-h-64 overflow-y-auto',
                  'rounded-xl border border-border bg-popover p-3 shadow-xl',
                  'pointer-events-none'
                )}
              >
                <div className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wider">
                  Preview
                </div>
                {preview}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
