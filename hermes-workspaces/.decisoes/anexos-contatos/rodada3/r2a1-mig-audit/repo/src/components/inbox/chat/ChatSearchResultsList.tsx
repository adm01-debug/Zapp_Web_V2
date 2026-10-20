import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { FileText, Image, Video, Music, File } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { HighlightedText } from './HighlightedText';
import type { Message } from '@/types/chat';

const TYPE_ICON_MAP: Record<string, typeof FileText> = {
  image: Image,
  video: Video,
  audio: Music,
  document: File,
};

interface ChatSearchResultsListProps {
  results: Message[];
  activeIndex: number;
  debouncedQuery: string;
  onSelect: (idx: number, messageId: string) => void;
}

export const ChatSearchResultsList = forwardRef<HTMLDivElement, ChatSearchResultsListProps>(
  ({ results, activeIndex, debouncedQuery, onSelect }, ref) => {
    if (results.length === 0) return null;

    return (
      <div ref={ref} className="max-h-[140px] overflow-y-auto scrollbar-thin space-y-0.5 rounded-lg bg-muted/30 p-1">
        {results.slice(0, 5).map((msg, idx) => {
          const snippet = (msg.content || msg.transcription || msg.mediaUrl || '').slice(0, 80);
          const TypeIcon = TYPE_ICON_MAP[msg.type] || FileText;
          const isActive = activeIndex === idx;
          return (
            <motion.button
              key={msg.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: idx * 0.03 }}
              onClick={() => onSelect(idx, msg.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-all duration-150 text-xs',
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
        })}
        {results.length > 5 && (
          <span className="text-3xs text-muted-foreground px-2.5 py-1 block">+{results.length - 5} resultados — use ↑↓ para navegar</span>
        )}
      </div>
    );
  }
);

ChatSearchResultsList.displayName = 'ChatSearchResultsList';
