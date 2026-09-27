import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { SmilePlus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
      aria-label={`${reaction.emoji} ${reaction.count} reação${reaction.count !== 1 ? 'ões' : ''}`}
      aria-pressed={reaction.reactedByMe}
    >
      <span>{reaction.emoji}</span>
      <span className="tabular-nums font-medium">{reaction.count}</span>
    </button>
  );
});
