import { memo, useCallback, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { format, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileText, MessageCircle, Pin, Star } from 'lucide-react';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import { CONTACT_TYPE_CONFIG } from '@/components/contacts/contactTypeConfig';
import { ConversationGroupHeader } from './conversation-list/ConversationGroupHeader';
import {
  buildConversationListEntries,
  conversationDate,
} from './conversation-list/groupConversations';

interface VirtualizedRealtimeListProps {
  conversations: ConversationWithMessages[];
  selectedContactId: string | null;
  onSelectConversation: (contactId: string) => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelection?: (contactId: string) => void;
  onPin?: (contactId: string) => void;
  pinnedIds?: Set<string>;
  onFavorite?: (contactId: string) => void;
  favoriteIds?: Set<string>;
}

const GROUP_HEIGHT = 32;
const CONVERSATION_HEIGHT = 88;
const EMPTY_SET = new Set<string>();

export function VirtualizedRealtimeList({
  conversations,
  selectedContactId,
  onSelectConversation,
  selectionMode = false,
  selectedIds = EMPTY_SET,
  onToggleSelection,
  onPin,
  pinnedIds = EMPTY_SET,
  onFavorite,
  favoriteIds = EMPTY_SET,
}: VirtualizedRealtimeListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const entries = useMemo(
    () => buildConversationListEntries(Array.isArray(conversations) ? conversations : [], pinnedIds),
    [conversations, pinnedIds],
  );
  const getScrollElement = useCallback(() => parentRef.current, []);

  // TanStack Virtual exposes imperative functions by design. The list entries,
  // scroll resolver and item keys are stable, so opting this component out of
  // React Compiler memoization is intentional and does not hide stale inputs.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement,
    estimateSize: (index) => entries[index]?.kind === 'header' ? GROUP_HEIGHT : CONVERSATION_HEIGHT,
    getItemKey: (index) => entries[index]?.key ?? index,
    overscan: 6,
  });

  if (entries.length === 0) return null;

  return (
    <div ref={parentRef} className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin">
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const entry = entries[virtualRow.index];
          if (!entry) return null;
          return (
            <div
              key={entry.key}
              className="absolute left-0 top-0 w-full"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {entry.kind === 'header' ? (
                <ConversationGroupHeader title={entry.title} count={entry.count} pinned={entry.pinned} />
              ) : (
                <ConversationRow
                  conversation={entry.conversation}
                  selected={selectedContactId === entry.conversation.contact.id}
                  checked={selectedIds.has(entry.conversation.contact.id)}
                  pinned={pinnedIds.has(entry.conversation.contact.id)}
                  favorite={favoriteIds.has(entry.conversation.contact.id)}
                  selectionMode={selectionMode}
                  onSelect={onSelectConversation}
                  onToggleSelection={onToggleSelection}
                  onPin={onPin}
                  onFavorite={onFavorite}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ConversationRowProps {
  conversation: ConversationWithMessages;
  selected: boolean;
  checked: boolean;
  pinned: boolean;
  favorite: boolean;
  selectionMode: boolean;
  onSelect: (contactId: string) => void;
  onToggleSelection?: (contactId: string) => void;
  onPin?: (contactId: string) => void;
  onFavorite?: (contactId: string) => void;
}

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document', 'file']);

const ConversationRow = memo(function ConversationRow({
  conversation,
  selected,
  checked,
  pinned,
  favorite,
  selectionMode,
  onSelect,
  onToggleSelection,
  onPin,
  onFavorite,
}: ConversationRowProps) {
  const contact = conversation.contact;
  const contactId = contact.id;
  const tags = contact.tags ?? [];
  const normalizedTags = tags.map((tag) => tag.toLocaleLowerCase('pt-BR'));
  const typeConfig = contact.contact_type ? CONTACT_TYPE_CONFIG[contact.contact_type] : undefined;
  const isWhatsApp = Boolean(contact.whatsapp_connection_id);
  const isVip = normalizedTags.includes('vip');
  const lastMessageType = conversation.lastMessage?.message_type ?? 'text';
  const lastMessageText = MEDIA_TYPES.has(lastMessageType)
    ? `Arquivo: ${conversation.lastMessage?.content || lastMessageType}`
    : conversation.lastMessage?.content || 'Sem mensagens';
  const date = conversationDate(conversation);
  const displayTime = isToday(date)
    ? format(date, 'HH:mm', { locale: ptBR })
    : format(date, 'dd/MM', { locale: ptBR });

  const selectConversation = () => {
    if (selectionMode) onToggleSelection?.(contactId);
    else onSelect(contactId);
  };

  return (
    <article
      data-testid="conversation-item"
      data-contact-id={contactId}
      className={cn(
        'group mx-3 my-0.5 flex min-h-[84px] items-center gap-3 rounded-xl border px-3 py-2 transition-colors',
        selected
          ? 'border-primary/40 bg-accent'
          : 'border-transparent bg-transparent hover:bg-muted/40',
        checked && 'border-primary/40 bg-primary/10',
      )}
    >
      {selectionMode && (
        <Checkbox
          checked={checked}
          onCheckedChange={() => onToggleSelection?.(contactId)}
          aria-label={`Selecionar conversa com ${contact.name || 'contato sem nome'}`}
          className="shrink-0 data-[state=checked]:bg-primary"
        />
      )}

      <div
        role="button"
        tabIndex={0}
        aria-current={selected ? 'true' : undefined}
        aria-label={`Abrir conversa com ${contact.name || 'contato sem nome'}`}
        onClick={selectConversation}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
            event.preventDefault();
            selectConversation();
          }
        }}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative shrink-0">
          <Avatar className="h-12 w-12 ring-1 ring-border/60">
            <AvatarImage src={contact.avatar_url || undefined} alt="" />
            <AvatarFallback className={cn(
              'text-sm font-semibold',
              getAvatarColor(contact.name || '?').bg,
              getAvatarColor(contact.name || '?').text,
            )}>
              {getInitials(contact.name || '?')}
            </AvatarFallback>
          </Avatar>
          {isWhatsApp && (
            <span
              className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-success text-primary-foreground ring-2 ring-card"
              aria-label="WhatsApp"
            >
              <MessageCircle className="h-3 w-3" aria-hidden="true" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Conversa fixada" />}
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">
              {contact.name || 'Sem nome'}
            </span>
            <time dateTime={date.toISOString()} className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {displayTime}
            </time>
          </div>

          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-[13px] text-muted-foreground">
              {MEDIA_TYPES.has(lastMessageType) && <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              <span className="truncate">{lastMessageText}</span>
            </span>
            {conversation.unreadCount > 0 && (
              <span className="flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
              </span>
            )}
          </div>

          {(typeConfig || isVip || conversation.contact.ai_sentiment) && (
            <div className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden">
              {typeConfig && (
                <span className="truncate rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                  {typeConfig.label}
                </span>
              )}
              {isVip && (
                <span className="rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                  VIP
                </span>
              )}
              {conversation.contact.ai_sentiment && (
                <span className="truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {conversation.contact.ai_sentiment === 'positive' ? 'Positivo' : conversation.contact.ai_sentiment === 'negative' ? 'Atenção' : 'Neutro'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1">
        <button
          type="button"
          aria-label={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          aria-pressed={favorite}
          onClick={(event) => {
            event.stopPropagation();
            onFavorite?.(contactId);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-warning focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star className={cn('h-3.5 w-3.5', favorite && 'fill-warning text-warning')} />
        </button>
        {pinned && onPin && (
          <button
            type="button"
            aria-label="Desafixar conversa"
            onClick={(event) => {
              event.stopPropagation();
              onPin(contactId);
            }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-primary outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pin className="h-3 w-3" />
          </button>
        )}
      </div>
    </article>
  );
});
