import { useRef, useState, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Pin, Gift } from 'lucide-react';

interface VirtualizedRealtimeListProps {
  conversations: ConversationWithMessages[];
  selectedContactId: string | null;
  onSelectConversation: (contactId: string) => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelection?: (contactId: string) => void;
  onMarkAsRead?: (contactId: string) => void;
  onArchive?: (contactId: string) => void;
  onPin?: (contactId: string) => void;
  pinnedIds?: Set<string>;
}

const ITEM_HEIGHT = 80;
const EMPTY_SET = new Set<string>();

export function VirtualizedRealtimeList({
  conversations,
  selectedContactId,
  onSelectConversation,
  selectionMode = false,
  selectedIds = EMPTY_SET,
  onToggleSelection,
  onMarkAsRead,
  onArchive,
  onPin,
  pinnedIds = EMPTY_SET,
}: VirtualizedRealtimeListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Filter out invalid conversations
  const safeConversations = useMemo(() => {
    if (!Array.isArray(conversations)) return [];
    return conversations.filter(c => c?.contact?.id);
  }, [conversations]);

  // Sort: pinned first, then by last message date
  const sortedConversations = useMemo(() => {
    return [...safeConversations].sort((a, b) => {
      const aPin = pinnedIds.has(a.contact.id);
      const bPin = pinnedIds.has(b.contact.id);
      if (aPin && !bPin) return -1;
      if (!aPin && bPin) return 1;
      const aTime = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
      const bTime = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [safeConversations, pinnedIds]);

  const virtualizer = useVirtualizer({
    count: sortedConversations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  const handleClick = useCallback((contactId: string, e: React.MouseEvent) => {
    if (selectionMode && onToggleSelection) {
      e.preventDefault();
      onToggleSelection(contactId);
    } else {
      onSelectConversation(contactId);
    }
  }, [selectionMode, onToggleSelection, onSelectConversation]);

  if (sortedConversations.length === 0) {
    return null;
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto scrollbar-thin">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <ConversationRow
            key={sortedConversations[virtualRow.index].contact.id}
            index={virtualRow.index}
            conversation={sortedConversations[virtualRow.index]}
            virtualRow={virtualRow}
            selectedContactId={selectedContactId}
            isSelected={selectedIds.has(sortedConversations[virtualRow.index].contact.id)}
            isPinned={pinnedIds.has(sortedConversations[virtualRow.index].contact.id)}
            selectionMode={selectionMode}
            onSelectConversation={onSelectConversation}
            onToggleSelection={onToggleSelection}
            handleClick={handleClick}
          />
        ))}
      </div>
    </div>
  );
}

import { memo } from 'react';

const ConversationRow = memo(({
  conversation,
  virtualRow,
  selectedContactId,
  isSelected,
  isPinned,
  selectionMode,
  onToggleSelection,
  handleClick
}: any) => {
  const contactId = conversation.contact.id;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: `${virtualRow.size}px`,
        transform: `translateY(${virtualRow.start}px)`,
      }}
      className="px-2"
    >
      <button
        onClick={(e) => handleClick(contactId, e)}
        className={cn(
          'w-full px-3 py-3 flex items-center gap-3 transition-all text-left border-b border-border/50',
          'hover:bg-muted/50',
          selectedContactId === contactId && 'bg-primary/10 border-l-2 border-l-primary',
          isSelected && 'bg-primary/15',
          isPinned && selectedContactId !== contactId && 'bg-muted/30'
        )}
      >
        {selectionMode && (
          <div
            className="flex-shrink-0 flex items-center"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelection?.(contactId);
            }}
          >
            <Checkbox checked={isSelected} className="data-[state=checked]:bg-primary" />
          </div>
        )}

        <div className="relative flex-shrink-0">
          <Avatar className="w-10 h-10">
            <AvatarImage src={conversation.contact.avatar_url || undefined} />
            <AvatarFallback className={cn(
              'text-xs font-semibold',
              getAvatarColor(conversation.contact.name || '?').bg,
              getAvatarColor(conversation.contact.name || '?').text
            )}>
              {getInitials(conversation.contact.name || '?')}
            </AvatarFallback>
          </Avatar>
          {conversation.contact.ai_sentiment && (
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card',
                conversation.contact.ai_sentiment === 'positive' && 'bg-[hsl(var(--success))]',
                conversation.contact.ai_sentiment === 'negative' && 'bg-destructive',
                conversation.contact.ai_sentiment === 'neutral' && 'bg-[hsl(var(--warning))]'
              )}
              title={`Sentimento: ${conversation.contact.ai_sentiment}`}
            />
          )}
        </div>

        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {isPinned && <Pin className="w-3 h-3 text-primary flex-shrink-0" />}
              {conversation.contact.contact_type === 'sicoob_gifts' && (
                <Gift className="w-3.5 h-3.5 text-info flex-shrink-0" />
              )}
              <span className="font-medium text-foreground truncate text-sm">
                {(() => {
                  const firstName = (conversation.contact.name || 'Sem nome').split(' ')[0];
                  const company = conversation.contact.company;
                  return company ? `${firstName} · ${company}` : firstName;
                })()}
              </span>
              {conversation.contact.ai_sentiment && conversation.contact.ai_sentiment !== 'neutral' && (
                <span className="text-xs flex-shrink-0" title={`Sentimento: ${conversation.contact.ai_sentiment}`}>
                  {conversation.contact.ai_sentiment === 'positive' ? '😊' : conversation.contact.ai_sentiment === 'negative' ? '😟' : ''}
                </span>
              )}
              {conversation.contact.contact_type === 'sicoob_gifts' && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-info/40 text-info bg-info/10 flex-shrink-0">
                  Sicoob Gifts
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {conversation.lastMessage && (
                <span className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(conversation.lastMessage.created_at), {
                    addSuffix: false,
                    locale: ptBR,
                  })}
                </span>
              )}
              {conversation.unreadCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-[10px] rounded-full flex items-center justify-center font-bold">
                  {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                </span>
              )}
            </div>
          </div>
          <p className="text-[13px] text-muted-foreground truncate">
            {conversation.contact.contact_type === 'sicoob_gifts' && conversation.contact.company
              ? `${conversation.contact.company} · ${conversation.lastMessage?.content || 'Sem mensagens'}`
              : conversation.lastMessage?.content || 'Sem mensagens'}
          </p>
          {conversation.contact.tags && conversation.contact.tags.length > 0 && (
            <div className="flex gap-1 mt-1.5">
              {conversation.contact.tags.slice(0, 2).map((tag: any) => (
                <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                  {tag}
                </Badge>
              ))}
              {conversation.contact.tags.length > 2 && (
                <span className="text-[10px] text-muted-foreground">
                  +{conversation.contact.tags.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      </button>
    </div>
  );
});
