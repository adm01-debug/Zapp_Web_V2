import { ReactNode, useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface ToolPanelProps {
  isOpen: boolean;
  onClose: () => void;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  headerRight?: ReactNode;
}

export function ToolPanel({ isOpen, onClose, icon, title, subtitle, children, className, headerRight }: ToolPanelProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Acessibilidade: o painel flutuante se comporta como diálogo modal. Ao abrir,
  // guardamos o elemento que tinha o foco (o gatilho) e movemos o foco para
  // dentro; ao fechar, devolvemos o foco ao gatilho.
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null;
    dialogRef.current?.focus();
    return () => {
      previouslyFocusedRef.current?.focus?.();
    };
  }, [isOpen]);

  // Esc fecha e Tab fica preso no diálogo (não vaza para a conversa atrás).
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const node = dialogRef.current;
    if (!node) return;
    const focusables = Array.from(
      node.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusables.length === 0) {
      event.preventDefault();
      node.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || active === node) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || active === node) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop translúcido */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-20 bg-black/50 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Modal centralizado */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className={cn(
              "absolute left-2 right-2 z-30 flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden focus:outline-none",
              "max-w-[470px] max-h-[70%] mx-auto top-[15%]",
              className
            )}
          >
            {/* Header padronizado */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 id={titleId} className="text-sm font-semibold text-foreground truncate">{title}</h3>
                {subtitle && (
                  <p className="text-2xs text-muted-foreground truncate">{subtitle}</p>
                )}
              </div>
              {headerRight}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Fechar painel"
                className="h-8 w-8 rounded-lg shrink-0 hover:bg-destructive/10 hover:text-destructive"
                onClick={onClose}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            {/* Corpo com scroll */}
            <ScrollArea className="flex-1">
              <div className="p-5">
                {children}
              </div>
            </ScrollArea>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
