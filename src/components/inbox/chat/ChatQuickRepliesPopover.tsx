import { useEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { zappMotion, zappPopoverVariants } from '@/lib/motion';

interface QuickReplyItem {
  id: string;
  title: string;
  shortcut: string;
  content: string;
  category: string;
}

interface ChatQuickRepliesPopoverProps {
  show: boolean;
  replies: QuickReplyItem[];
  onSelect: (reply: QuickReplyItem) => void;
  onClose: () => void;
}

/** Tecla em estilo kbd, só com tokens do sistema. */
function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-3xs text-muted-foreground">
      {children}
    </kbd>
  );
}

export function ChatQuickRepliesPopover({ show, replies, onSelect, onClose }: ChatQuickRepliesPopoverProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const panelRef = useRef<HTMLDivElement>(null);
  const isEmpty = replies.length === 0;

  // Vazio não tem campo de busca: o foco vai para o painel para o Esc (e o Tab) funcionarem.
  useEffect(() => {
    if (show && isEmpty) panelRef.current?.focus();
  }, [show, isEmpty]);

  // Movimento reduzido: nada se desloca (sem escala); só a opacidade muda.
  const panelVariants: Variants = reduceMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { duration: zappMotion.duration.normal } },
        exit: { opacity: 0, transition: { duration: zappMotion.duration.fast } },
      }
    : zappPopoverVariants;

  // Escuta no próprio painel (nunca em window/document); o painel recebe foco ao abrir.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="quick-replies-popover"
          ref={panelRef}
          tabIndex={-1}
          data-testid="quick-replies-popover"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onKeyDown={handleKeyDown}
          className="absolute bottom-20 left-4 right-4 z-10 overflow-hidden rounded-[var(--radius)] border border-border bg-card-elevated shadow-lg"
        >
          <div className="flex items-center justify-between px-3 pt-2.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sugestões Rápidas
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={onClose}
              aria-label="Fechar respostas rápidas"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <p className="px-3 pt-1 text-3xs text-muted-foreground">
            Use as setas ↑↓ para navegar e Enter para selecionar
          </p>

          {isEmpty ? (
            <div role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nenhuma resposta rápida cadastrada
            </div>
          ) : (
            <Command aria-label="Respostas rápidas" className="bg-transparent">
              <CommandInput autoFocus placeholder="Buscar por atalho ou título" />
              <CommandList className="max-h-48">
                <CommandEmpty>Nenhum resultado para esta busca.</CommandEmpty>
                {replies.map((reply) => (
                  <CommandItem
                    key={reply.id}
                    value={`${reply.title} ${reply.shortcut}`}
                    onSelect={() => onSelect(reply)}
                    className="min-h-10 gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-foreground">{reply.title}</span>
                        <Kbd>{reply.shortcut}</Kbd>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{reply.content}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          )}

          <div className="flex items-center gap-1.5 border-t border-border/60 px-3 py-2 text-3xs text-muted-foreground">
            <Kbd>↑↓</Kbd>
            <span>navegar</span>
            <span aria-hidden="true">·</span>
            <Kbd>Enter</Kbd>
            <span>usar</span>
            <span aria-hidden="true">·</span>
            <Kbd>Esc</Kbd>
            <span>fechar</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
