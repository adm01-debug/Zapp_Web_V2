/**
 * J05 — `Collapse`: expandir/recolher com altura animada (200 ms, `height: auto`)
 * para as mensagens agrupadas do episódio (S069). Recebe `id` e o publica no
 * painel; quando o gatilho é passado, o botão do gatilho carrega
 * `aria-expanded` + `aria-controls` apontando para ele. Com
 * `prefers-reduced-motion: reduce` abre e fecha direto, sem animação, e o
 * conteúdo nunca fica escondido de quem usa leitor de tela quando está aberto.
 */
import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { MOTION } from './presets';

export interface CollapseProps {
  /** Controlado por quem chama (o cartão do episódio decide). */
  open: boolean;
  children: ReactNode;
  /** `id` do painel: liga o gatilho ao conteúdo que ele abre. */
  id?: string;
  className?: string;
  /** Chamado no clique do gatilho. */
  onToggle?: () => void;
  /** Conteúdo do gatilho (o cabeçalho clicável do cartão). */
  trigger?: ReactNode;
}

export function Collapse({ open, children, id, className, onToggle, trigger }: CollapseProps) {
  const reduzido = useReducedMotion();
  const temGatilho = trigger !== undefined;

  // sem gatilho aqui, o painel publica o próprio estado para quem monta o botão
  const ariaDoPainel = !temGatilho && id ? { 'aria-expanded': open } : {};

  return (
    <div className={cn('min-w-0', className)} data-state={open ? 'open' : 'closed'}>
      {temGatilho && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={id}
          className="w-full max-w-full text-left"
        >
          {trigger}
        </button>
      )}

      <AnimatePresence initial={false}>
        {open &&
          (reduzido ? (
            <div key="painel" id={id} data-testid="collapse-panel" className="min-w-0" {...ariaDoPainel}>
              {children}
            </div>
          ) : (
            <motion.div
              key="painel"
              id={id}
              data-testid="collapse-panel"
              className="min-w-0 overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: MOTION.base / 1000, ease: MOTION.ease }}
              {...ariaDoPainel}
            >
              {children}
            </motion.div>
          ))}
      </AnimatePresence>
    </div>
  );
}
