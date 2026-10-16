import { forwardRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { FileText, Image, Video, Music, File, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { HighlightedText } from './HighlightedText';
import { Button } from '@/components/ui/button';
import { zappMotion, zappTransition } from '@/lib/motion';
import type { Message } from '@/types/chat';

const TYPE_ICON_MAP: Record<string, typeof FileText> = {
  image: Image,
  video: Video,
  audio: Music,
  document: File,
};

/** Quantos resultados cabem no preview antes de pedir a expansão. */
const PREVIEW_LIMIT = 5;
/** Escalonamento máximo por item (cartão: no máximo 40 ms). */
const STAGGER_MS = 0.03;

interface ChatSearchResultsListProps {
  results: Message[];
  activeIndex: number;
  debouncedQuery: string;
  onSelect: (idx: number, messageId: string) => void;
  /** Zera texto, filtro de tipo e data — usado pelo botão «Limpar filtros» do estado vazio. */
  onClearFilters?: () => void;
}

export const ChatSearchResultsList = forwardRef<HTMLDivElement, ChatSearchResultsListProps>(
  ({ results, activeIndex, debouncedQuery, onSelect, onClearFilters }, ref) => {
    const [expanded, setExpanded] = useState(false);
    // Movimento reduzido: nada se desloca, só muda opacidade.
    const reduz = useReducedMotion() ?? false;

    if (results.length === 0) {
      if (!debouncedQuery.trim()) return null;
      const term = debouncedQuery.trim().slice(0, 30);
      return (
        <div
          role="status"
          data-testid="chat-search-empty"
          data-reduced-motion={reduz ? 'true' : 'false'}
          className="flex flex-col items-center gap-2 px-3 py-4 rounded-lg bg-muted/30 text-center"
        >
          <motion.span
            aria-hidden="true"
            data-testid="chat-search-empty-lupa"
            className="grid place-items-center w-10 h-10 rounded-full bg-card text-muted-foreground shadow-sm"
            initial={reduz ? { opacity: 0 } : { opacity: 0, y: zappMotion.distance.small }}
            animate={reduz ? { opacity: [0.55, 1, 0.55] } : { opacity: 1, y: [0, -4, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: zappMotion.ease.standard }}
          >
            <Search className="w-4 h-4" />
          </motion.span>
          <span className="text-xs text-foreground">Nenhum resultado para esta busca.</span>
          <span className="text-2xs text-muted-foreground max-w-[260px]">
            Nada encontrado para “{term}”. Tente outra palavra ou limpe os filtros.
          </span>
          <Button
            type="button"
            variant="outline"
            className="h-10 px-3 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onClearFilters}
          >
            Limpar filtros
          </Button>
        </div>
      );
    }

    const hiddenCount = results.length - PREVIEW_LIMIT;
    const itemMotion = (idx: number) =>
      reduz
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: zappTransition.panel }
        : {
            initial: { opacity: 0, y: zappMotion.distance.micro },
            animate: { opacity: 1, y: 0 },
            transition: { ...zappTransition.panel, delay: Math.min(idx, 8) * STAGGER_MS },
          };

    const renderItem = (msg: Message, idx: number) => {
      const snippet = (msg.content || msg.transcription || msg.mediaUrl || '').slice(0, 80);
      const TypeIcon = TYPE_ICON_MAP[msg.type] || FileText;
      const isActive = activeIndex === idx;
      const { initial, animate, transition } = itemMotion(idx);
      return (
        <motion.button
          key={msg.id}
          type="button"
          data-testid="chat-search-item"
          initial={initial}
          animate={animate}
          transition={transition}
          onClick={() => onSelect(idx, msg.id)}
          className={cn(
            'w-full min-h-10 flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-all duration-150 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isActive ? 'bg-primary/15 text-foreground ring-1 ring-primary/20' : 'hover:bg-muted text-muted-foreground'
          )}
        >
          <TypeIcon className={cn("w-3.5 h-3.5 shrink-0", isActive ? "text-primary" : "opacity-50")} />
          <span className="text-3xs text-muted-foreground shrink-0 w-10 tabular-nums">{format(msg.timestamp, 'HH:mm')}</span>
          <span className="truncate flex-1">
            <HighlightedText text={snippet} query={debouncedQuery} />
            {(msg.content || '').length > 80 && '…'}
          </span>
          <span className={cn("text-[9px] px-1.5 py-0.5 rounded-md shrink-0 font-medium", msg.sender === 'agent' ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            {msg.sender === 'agent' ? 'Você' : 'Contato'}
          </span>
        </motion.button>
      );
    };

    return (
      <div className="space-y-1 rounded-lg bg-muted/30 p-1">
        <div ref={ref} className="max-h-[200px] overflow-y-auto scrollbar-thin space-y-0.5">
          {results.slice(0, PREVIEW_LIMIT).map((msg, idx) => renderItem(msg, idx))}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                key="chat-search-expanded"
                data-testid="chat-search-expanded"
                className="space-y-0.5 overflow-hidden"
                initial={reduz ? { opacity: 0 } : { height: 0, opacity: 0 }}
                animate={reduz ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                exit={reduz ? { opacity: 0 } : { height: 0, opacity: 0 }}
                transition={zappTransition.panel}
              >
                {results.slice(PREVIEW_LIMIT).map((msg, i) => renderItem(msg, PREVIEW_LIMIT + i))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {hiddenCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="chat-search-toggle"
            aria-expanded={expanded}
            className="w-full justify-start h-10 px-2.5 text-3xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? 'Mostrar menos resultados'
              : `+${hiddenCount} resultados. Use Enter e Shift+Enter para navegar.`}
          </Button>
        )}
      </div>
    );
  }
);

ChatSearchResultsList.displayName = 'ChatSearchResultsList';
