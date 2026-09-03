import { useRef, useCallback, useMemo } from 'react';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Pin, Gift, CheckCircle2, UserCheck, Star, AlarmClock, Archive } from 'lucide-react';
import { toast } from 'sonner';

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
  onResolve?: (contactId: string) => void;
  onTransfer?: (contactId: string) => void;
  onFavorite?: (contactId: string) => void;
  onSnooze?: (contactId: string) => void;
}

// py-2.5 (20) + conteudo (48 com avatar, ate ~60 com a linha de tags) + gap-1.5
// (6) + faixa de acoes h-7 (28) + border-b (1). A faixa e escondida com opacity,
// entao ocupa altura mesmo fora do hover.
const ITEM_HEIGHT = 120;
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
  onResolve,
  onTransfer,
  onFavorite,
  onSnooze,
}: VirtualizedRealtimeListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const safeConversations = useMemo(() => {
    if (!Array.isArray(conversations)) return [];
    return conversations.filter(c => c?.contact?.id);
  }, [conversations]);

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

  const getScrollElement = useCallback(() => parentRef.current, []);
  const estimateSize = useCallback(() => ITEM_HEIGHT, []);

  const virtualizer = useVirtualizer({
    count: sortedConversations.length,
    getScrollElement,
    estimateSize,
    overscan: 5,
  });

  const handleClick = useCallback((contactId: string, e: React.SyntheticEvent) => {
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
            conversation={sortedConversations[virtualRow.index]}
            virtualRow={virtualRow}
            selectedContactId={selectedContactId}
            isSelected={selectedIds.has(sortedConversations[virtualRow.index].contact.id)}
            isPinned={pinnedIds.has(sortedConversations[virtualRow.index].contact.id)}
            selectionMode={selectionMode}
            onToggleSelection={onToggleSelection}
            handleClick={handleClick}
            onResolve={onResolve}
            onTransfer={onTransfer}
            onPin={onPin}
            onFavorite={onFavorite}
            onSnooze={onSnooze}
            onArchive={onArchive}
          />
        ))}
      </div>
    </div>
  );
}

import { memo } from 'react';

const SENTIMENT_LABEL: Record<string, string> = {
  positive: 'positivo',
  negative: 'negativo',
  neutral: 'neutro',
};

interface ConversationRowProps {
  conversation: ConversationWithMessages;
  virtualRow: VirtualItem;
  selectedContactId: string | null;
  isSelected: boolean;
  isPinned: boolean;
  selectionMode: boolean;
  onToggleSelection?: (contactId: string) => void;
  handleClick: (contactId: string, e: React.SyntheticEvent) => void;
  onResolve?: (contactId: string) => void;
  onTransfer?: (contactId: string) => void;
  onPin?: (contactId: string) => void;
  onFavorite?: (contactId: string) => void;
  onSnooze?: (contactId: string) => void;
  onArchive?: (contactId: string) => void;
}

const ConversationRow = memo(({
  conversation,
  virtualRow,
  selectedContactId,
  isSelected,
  isPinned,
  selectionMode,
  onToggleSelection,
  handleClick,
  onResolve,
  onTransfer,
  onPin,
  onFavorite,
  onSnooze,
  onArchive,
}: ConversationRowProps) => {
  const contactId = conversation.contact.id;

  const handleAction = (e: React.MouseEvent, handler: ((id: string) => void) | undefined, label: string) => {
    e.stopPropagation();
    if (handler) handler(contactId);
    else toast.info(`${label}: em breve`);
  };

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
      <div
        className={cn(
          'w-full px-3 py-2.5 flex flex-col gap-1.5 transition-all text-left border-b border-border/50 group',
          'hover:bg-muted/50',
          selectedContactId === contactId && 'bg-primary/10 border-l-2 border-l-primary',
          isSelected && 'bg-primary/15',
          isPinned && selectedContactId !== contactId && 'bg-muted/30'
        )}
      >
        <div className="flex items-center gap-3">
          {selectionMode && (
            <div className="flex-shrink-0 flex items-center">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelection?.(contactId)}
                aria-label={`Selecionar conversa com ${conversation.contact.name || 'contato sem nome'}`}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          )}

          {/* role="button" e nao <button>: o conteudo tem <div> e <p>, que nao sao
              conteudo valido de button. Aqui nao ha mais aninhamento — checkbox e
              faixa de acoes sao irmaos deste elemento, entao o onKeyDown so
              dispara com o foco nele. */}
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => handleClick(contactId, e)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              // Espaco segurado auto-repete; um <button> nativo ignora repeticao.
              if (e.repeat) return;
              e.preventDefault();
              handleClick(contactId, e);
            }}
            className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer outline-none rounded-md focus-visible:ring-2 focus-visible:ring-primary/40"
          >
          <div className="relative flex-shrink-0">
            <Avatar className="w-12 h-12">
              <AvatarImage src={conversation.contact.avatar_url || undefined} alt="" />
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
                role="img"
                aria-label={`Sentimento: ${SENTIMENT_LABEL[conversation.contact.ai_sentiment] ?? conversation.contact.ai_sentiment}`}
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card',
                  conversation.contact.ai_sentiment === 'positive' && 'bg-[hsl(var(--success))]',
                  conversation.contact.ai_sentiment === 'negative' && 'bg-destructive',
                  conversation.contact.ai_sentiment === 'neutral' && 'bg-[hsl(var(--warning))]'
                )}
                title={`Sentimento: ${SENTIMENT_LABEL[conversation.contact.ai_sentiment] ?? conversation.contact.ai_sentiment}`}
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
                  <span className="text-xs flex-shrink-0" aria-hidden="true" title={`Sentimento: ${SENTIMENT_LABEL[conversation.contact.ai_sentiment] ?? conversation.contact.ai_sentiment}`}>
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
              <div className="flex gap-1 mt-1">
                {conversation.contact.tags.slice(0, 2).map((tag: string) => (
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
          </div>
        </div>

        {/* Hover action buttons */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-150 translate-y-0.5 group-hover:translate-y-0 pl-[60px]">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label="Resolver conversa"
                  onClick={(e) => handleAction(e, onResolve, 'Resolver')}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-emerald-500 hover:bg-emerald-500/10 active:scale-90 transition-all duration-150"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">Resolver</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label="Transferir conversa"
                  onClick={(e) => handleAction(e, onTransfer, 'Transferir')}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-primary hover:bg-primary/10 active:scale-90 transition-all duration-150"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">Transferir</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label="Fixar conversa"
                  onClick={(e) => handleAction(e, onPin, 'Fixar')}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-amber-500 hover:bg-amber-500/10 active:scale-90 transition-all duration-150"
                >
                  <Pin className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">Fixar</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label="Favoritar conversa"
                  onClick={(e) => handleAction(e, onFavorite, 'Favoritar')}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-amber-400 hover:bg-amber-400/10 active:scale-90 transition-all duration-150"
                >
                  <Star className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">Favoritar</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label="Adiar conversa"
                  onClick={(e) => handleAction(e, onSnooze, 'Adiar')}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-sky-500 hover:bg-sky-500/10 active:scale-90 transition-all duration-150"
                >
                  <AlarmClock className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">Adiar</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label="Arquivar conversa"
                  onClick={(e) => handleAction(e, onArchive, 'Arquivar')}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 active:scale-90 transition-all duration-150"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs font-medium">Arquivar</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
});
