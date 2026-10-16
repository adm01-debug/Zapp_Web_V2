import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { SmilePlus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { plural } from '@/lib/plural';

// eslint-disable-next-line react-refresh/only-export-components
export const WHATSAPP_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
// eslint-disable-next-line react-refresh/only-export-components
export const EXTENDED_EMOJIS = [
  '👍', '👎', '❤️', '🔥', '🎉', '😂', '😮', '😢', '😡', '🙏',
  '✅', '💯', '🚀', '👀', '🤔', '😍', '🥳', '💪', '👏', '🤝',
];

export interface ReactionGroup {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  profileIds: string[];
}

export interface ReactionBadgeProps {
  reaction: ReactionGroup;
  onClick: (emoji: string) => void;
  size?: 'sm' | 'xs';
}

export const ReactionBadge = memo(function ReactionBadge({ reaction, onClick, size = 'sm' }: ReactionBadgeProps) {
  return (
    <button
      onClick={() => onClick(reaction.emoji)}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border transition-all select-none',
        size === 'xs' ? 'px-1.5 py-0.5 text-3xs' : 'px-2 py-0.5 text-xs',
        reaction.reactedByMe
          ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
          : 'border-border bg-background hover:bg-accent text-foreground',
      )}
      aria-label={`${reaction.emoji} ${plural(reaction.count, 'reação', 'reações')}`}
      aria-pressed={reaction.reactedByMe}
    >
      <span>{reaction.emoji}</span>
      <span className="tabular-nums font-medium">{reaction.count}</span>
    </button>
  );
});

export interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  emojis?: string[];
  onClose?: () => void;
}

export const ReactionPicker = memo(function ReactionPicker({ onSelect, emojis = EXTENDED_EMOJIS, onClose }: ReactionPickerProps) {
  const cols = 5;
  const [focused, setFocused] = useState(0);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    btnRefs.current[focused]?.focus();
  }, [focused]);

  const handleKey = useCallback((e: React.KeyboardEvent, idx: number) => {
    let next = idx;
    if (e.key === 'ArrowRight') next = Math.min(idx + 1, emojis.length - 1);
    else if (e.key === 'ArrowLeft') next = Math.max(idx - 1, 0);
    else if (e.key === 'ArrowDown') next = Math.min(idx + cols, emojis.length - 1);
    else if (e.key === 'ArrowUp') next = Math.max(idx - cols, 0);
    else if (e.key === 'Escape') { onClose?.(); return; }
    else if (e.key === 'Enter' || e.key === ' ') { onSelect(emojis[idx]); return; }
    else return;
    e.preventDefault();
    setFocused(next);
  }, [emojis, cols, onSelect, onClose]);

  return (
    <div
      role="grid"
      aria-label="Selecionar reação"
      className="grid gap-1 p-2"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {emojis.map((emoji, idx) => (
        <button
          key={emoji}
          ref={el => { btnRefs.current[idx] = el; }}
          role="gridcell"
          tabIndex={focused === idx ? 0 : -1}
          onClick={() => onSelect(emoji)}
          onKeyDown={e => handleKey(e, idx)}
          className="flex items-center justify-center w-8 h-8 rounded hover:bg-accent text-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
});

export interface MessageReactionBarProps {
  reactions: ReactionGroup[];
  onToggle: (emoji: string) => void;
  isMine?: boolean;
  className?: string;
}

export const MessageReactionBar = memo(function MessageReactionBar({
  reactions,
  onToggle,
  isMine,
  className,
}: MessageReactionBarProps) {
  const [open, setOpen] = useState(false);

  if (reactions.length === 0) return null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1 mt-1',
        isMine ? 'justify-end' : 'justify-start',
        className,
      )}
    >
      {reactions.map(r => (
        <ReactionBadge key={r.emoji} reaction={r} onClick={onToggle} size="xs" />
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 rounded-full opacity-0 group-hover/msg:opacity-100 focus-visible:opacity-100 transition-opacity [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]"
            aria-label="Adicionar reação"
          >
            <SmilePlus className="w-3 h-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" side="top" align={isMine ? 'end' : 'start'}>
          <ReactionPicker onSelect={e => { onToggle(e); setOpen(false); }} onClose={() => setOpen(false)} />
        </PopoverContent>
      </Popover>
    </div>
  );
});

export interface QuickReactionStripProps {
  onSelect: (emoji: string) => void;
  onOpenFull: () => void;
  isMine?: boolean;
}

export const QuickReactionStrip = memo(function QuickReactionStrip({ onSelect, onOpenFull, isMine }: QuickReactionStripProps) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Setas percorrem os emojis rápidos e, em seguida, o gatilho do seletor completo —
  // a tira é UM controle de teclado, não seis botões soltos. Esc sai dela: quem a mantém
  // visível é o foco, então ao sair o foco ela volta a se esconder.
  const handleKey = useCallback((e: React.KeyboardEvent, idx: number) => {
    const total = WHATSAPP_EMOJIS.length + 1;
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % total;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + total) % total;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = total - 1;
    else if (e.key === 'Escape') {
      (document.activeElement as HTMLElement | null)?.blur();
      return;
    } else return;
    e.preventDefault();
    btnRefs.current[next]?.focus();
  }, []);

  return (
    <div
      className={cn(
        'absolute -top-9 flex items-center gap-0.5 bg-popover border border-border rounded-full px-2 py-1 shadow-md',
        // Revelada no hover E no foco de teclado: `group-focus-within/msg` cobre a bolha
        // inteira (quem chega pelo Tab em qualquer controle da mensagem) e `focus-within`
        // mantém a tira visível enquanto o foco está dentro dela.
        'opacity-0 pointer-events-none transition-opacity z-10',
        'group-hover/msg:opacity-100 group-hover/msg:pointer-events-auto',
        'group-focus-within/msg:opacity-100 group-focus-within/msg:pointer-events-auto',
        'focus-within:opacity-100 focus-within:pointer-events-auto',
        isMine ? 'right-0' : 'left-0',
      )}
      role="toolbar"
      aria-label="Reação rápida"
    >
      {WHATSAPP_EMOJIS.map((emoji, idx) => (
        <button
          key={emoji}
          ref={el => { btnRefs.current[idx] = el; }}
          onClick={() => onSelect(emoji)}
          onKeyDown={e => handleKey(e, idx)}
          className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-accent text-base transition-all motion-safe:hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          aria-label={`Reagir com ${emoji}`}
        >
          {emoji}
        </button>
      ))}
      <button
        ref={el => { btnRefs.current[WHATSAPP_EMOJIS.length] = el; }}
        onClick={onOpenFull}
        onKeyDown={e => handleKey(e, WHATSAPP_EMOJIS.length)}
        className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-accent transition-all motion-safe:hover:scale-110 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]"
        aria-label="Mais reações"
      >
        <SmilePlus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});
