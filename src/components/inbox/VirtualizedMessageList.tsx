import { useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Message, InteractiveButton } from '@/types/chat';
import { MessageBubble } from './VirtualMessageBubble';
import { Clock } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface VirtualizedMessageListProps {
  messages: Message[];
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onCopy: (content: string) => void;
  onInteractiveButtonClick: (button: InteractiveButton) => void;
  ttsLoading: boolean;
  ttsPlaying: boolean;
  ttsMessageId: string | null;
  onSpeak: (messageId: string, text: string) => void;
  onStopSpeak: () => void;
  isContactTyping?: boolean;
}

export interface VirtualizedMessageListRef {
  scrollToBottom: () => void;
  scrollToMessage: (messageId: string) => void;
}

function formatDateSeparator(date: Date): string {
  if (isToday(date)) return 'Hoje';
  if (isYesterday(date)) return 'Ontem';
  return format(date, "d 'de' MMMM", { locale: ptBR });
}

type ListItem =
  | { type: 'date-separator'; date: Date; key: string }
  | { type: 'message'; message: Message; key: string };

export const VirtualizedMessageList = forwardRef<VirtualizedMessageListRef, VirtualizedMessageListProps>(({
  messages, onReply, onForward, onCopy, onInteractiveButtonClick,
  ttsLoading, ttsPlaying, ttsMessageId, onSpeak, onStopSpeak, isContactTyping = false,
}, ref) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const listItems = useMemo((): ListItem[] => {
    const items: ListItem[] = [];
    let currentDate = '';
    messages.forEach((message) => {
      const dateKey = format(message.timestamp, 'yyyy-MM-dd');
      if (dateKey !== currentDate) { currentDate = dateKey; items.push({ type: 'date-separator', date: new Date(dateKey), key: `date-${dateKey}` }); }
      items.push({ type: 'message', message, key: message.id });
    });
    return items;
  }, [messages]);

  const getItemSize = useCallback((index: number) => {
    const item = listItems[index];
    if (item.type === 'date-separator') return 50;
    const message = item.message;
    if (message.type === 'image' || message.type === 'video') return 280;
    if (message.type === 'audio') return 120;
    if (message.type === 'document') return 100;
    if (message.type === 'location') return 200;
    const lines = Math.ceil(message.content.length / 50);
    return Math.max(80, 60 + lines * 20);
  }, [listItems]);

  const virtualizer = useVirtualizer({ count: listItems.length, getScrollElement: () => parentRef.current, estimateSize: getItemSize, overscan: 10 });

  const scrollToBottom = useCallback(() => { if (listItems.length > 0) virtualizer.scrollToIndex(listItems.length - 1, { align: 'end' }); }, [listItems.length, virtualizer]);
  const scrollToMessage = useCallback((messageId: string) => { const index = listItems.findIndex(item => item.type === 'message' && item.message.id === messageId); if (index !== -1) virtualizer.scrollToIndex(index, { align: 'center' }); }, [listItems, virtualizer]);

  useImperativeHandle(ref, () => ({ scrollToBottom, scrollToMessage }), [scrollToBottom, scrollToMessage]);
  useEffect(() => { scrollToBottom(); }, [messages.length, isContactTyping, scrollToBottom]);

  if (messages.length === 0) {
    return <div className="flex items-center justify-center h-full"><EmptyState icon={Clock} title="Nenhuma mensagem ainda" description="As mensagens aparecerão aqui quando a conversa começar" illustration="messages" size="sm" /></div>;
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-auto scrollbar-thin bg-muted/5">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = listItems[virtualRow.index];
          return (
            <div key={virtualRow.key} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}>
              {item.type === 'date-separator' ? (
                <div className="flex justify-center py-2 px-4">
                  <span className="text-xs text-muted-foreground bg-muted/50 px-4 py-1.5 rounded-full font-medium border border-border/20">{formatDateSeparator(item.date)}</span>
                </div>
              ) : (
                <MessageBubble
                  message={item.message} onReply={onReply} onForward={onForward} onCopy={onCopy}
                  onInteractiveButtonClick={onInteractiveButtonClick}
                  ttsLoading={ttsLoading} ttsPlaying={ttsPlaying} ttsMessageId={ttsMessageId}
                  onSpeak={onSpeak} onStopSpeak={onStopSpeak} scrollToMessage={scrollToMessage}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

VirtualizedMessageList.displayName = 'VirtualizedMessageList';
