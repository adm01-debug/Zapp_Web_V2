import { useRef, forwardRef, useImperativeHandle, useCallback, useMemo, memo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { getLogger } from '@/lib/logger';

const log = getLogger('ChatMessagesArea');
import { ChatService } from '@/services/chat.service';
import { RealtimeService } from '@/services/realtime.service';
import { ChatWatermark } from './ChatWatermark';
import { cn } from '@/lib/utils';
import { Message, InteractiveButton } from '@/types/chat';
import { motion } from '@/components/ui/motion';
import { TypingIndicator } from '../TypingIndicator';
import { format, isSameDay } from 'date-fns';
import { formatDateSeparator } from './messageUtils';
import { MessageBubble } from './MessageBubble';

interface ChatMessagesAreaProps {
  messages: Message[];
  isContactTyping: boolean;
  typingUserName: string;
  ttsLoading: boolean;
  ttsPlaying: boolean;
  ttsMessageId: string | null;
  instanceName?: string;
  contactJid?: string;
  contactAvatar?: string;
  onSpeak: (messageId: string, text: string) => void;
  onStop: () => void;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onCopy: (content: string) => void;
  onScrollToMessage: (messageId: string) => void;
  onInteractiveButtonClick: (button: InteractiveButton) => void;
  onEditStart?: (message: Message) => void;
  highlightedMessageIds?: Set<string>;
  activeHighlightId?: string | null;
  searchQuery?: string;
}

export interface ChatMessagesAreaRef {
  scrollToBottom: () => void;
  registerMessageRef: (messageId: string, el: HTMLDivElement | null) => void;
  scrollToMessage: (messageId: string) => void;
}

export const ChatMessagesArea = memo(forwardRef<ChatMessagesAreaRef, ChatMessagesAreaProps>(({
  messages, isContactTyping, typingUserName, ttsLoading, ttsPlaying, ttsMessageId,
  instanceName, contactJid, contactAvatar, onSpeak, onStop, onReply, onForward, onCopy,
  onScrollToMessage, onInteractiveButtonClick, onEditStart, highlightedMessageIds, activeHighlightId, searchQuery,
}, ref) => {
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleMessageDeleted = useCallback(async (messageId: string) => {
    try {
      await ChatService.deleteMessage(messageId);
    } catch {
      log.error('Failed to mark message as deleted in DB');
    }
  }, []);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 100,
    overscan: 10,
  });

  useImperativeHandle(ref, () => ({
    scrollToBottom: () => {
      const container = scrollContainerRef.current;
      if (container) {
        virtualizer.scrollToIndex(messages.length - 1, { align: 'end', behavior: 'smooth' });
      }
    },
    registerMessageRef: (messageId: string, el: HTMLDivElement | null) => {
      messageRefs.current[messageId] = el;
    },
    scrollToMessage: (messageId: string) => {
      const index = messages.findIndex(m => m.id === messageId);
      if (index !== -1) {
        virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
        // Highlighting after scroll is handled via highlightedMessageIds prop
      }
    },
  }));

  const messageIds = useMemo(() => messages.map((message) => message.id).filter(Boolean), [messages]);
  const messageIdsSet = useMemo(() => new Set(messageIds), [messageIds]);
  const messageIdsKey = useMemo(() => messageIds.join(','), [messageIds]);

  useEffect(() => {
    if (messageIds.length === 0) return;

    const channel = RealtimeService.subscribeToReactions(messageIds[0] ?? 'empty', (payload) => {
      const nextMessageId = (payload.new as { message_id?: string } | null)?.message_id;
      const prevMessageId = (payload.old as { message_id?: string } | null)?.message_id;
      const reactionMessageId = nextMessageId ?? prevMessageId;

      if (!reactionMessageId || !messageIdsSet.has(reactionMessageId)) return;

      queryClient.invalidateQueries({ queryKey: ['message-reactions', reactionMessageId] });
    });

    return () => { void RealtimeService.removeChannel(channel); };
  }, [messageIds.length, messageIdsKey, messageIdsSet, queryClient]);

  const groupedMessages = useMemo(() => {
    return messages.reduce((groups, message) => {
      const dateKey = format(message.timestamp, 'yyyy-MM-dd');
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(message);
      return groups;
    }, {} as Record<string, Message[]>);
  }, [messages]);

  return (
    <div ref={scrollContainerRef} role="log" aria-label="Mensagens da conversa" aria-live="polite" className="flex-1 min-h-0 min-w-0 overflow-y-auto px-4 py-6 md:px-8 scrollbar-thin bg-background/50 relative">
      <ChatWatermark />

      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const message = messages[virtualRow.index];
          const prevMsg = messages[virtualRow.index - 1];
          const nextMsg = messages[virtualRow.index + 1];

          const showDateSeparator = !prevMsg || !isSameDay(message.timestamp, prevMsg.timestamp);
          const isFirstInGroup = !prevMsg || prevMsg.sender !== message.sender || showDateSeparator;
          const isLastInGroup = !nextMsg || nextMsg.sender !== message.sender || !isSameDay(message.timestamp, nextMsg.timestamp);

          return (
            <div
              key={message.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="py-1"
            >
              {showDateSeparator && (
                <div className="flex justify-center my-5">
                  <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/80 bg-muted/50 backdrop-blur-sm px-4 py-1 rounded-full border border-border/30 shadow-sm">
                    {formatDateSeparator(message.timestamp)}
                  </motion.span>
                </div>
              )}

              <MessageBubble
                message={message}
                isFirstInGroup={isFirstInGroup}
                isLastInGroup={isLastInGroup}
                contactAvatar={contactAvatar}
                instanceName={instanceName}
                contactJid={contactJid}
                ttsLoading={ttsLoading}
                ttsPlaying={ttsPlaying}
                ttsMessageId={ttsMessageId}
                highlightedMessageIds={highlightedMessageIds}
                activeHighlightId={activeHighlightId}
                searchQuery={searchQuery}
                onSpeak={onSpeak}
                onStop={onStop}
                onReply={onReply}
                onForward={onForward}
                onCopy={onCopy}
                onScrollToMessage={onScrollToMessage}
                onInteractiveButtonClick={onInteractiveButtonClick}
                onEditStart={onEditStart}
                onMessageDeleted={handleMessageDeleted}
                registerRef={(el) => { messageRefs.current[message.id] = el; }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-start pl-10 mt-4">
        <TypingIndicator isVisible={isContactTyping} userName={typingUserName} />
      </div>
      <div ref={messagesEndRef} />
    </div>
  );
}));

ChatMessagesArea.displayName = 'ChatMessagesArea';