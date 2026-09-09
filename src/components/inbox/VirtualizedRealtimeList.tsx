import { useRef, useCallback, useMemo, memo } from 'react';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import { formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Pin, Gift, CheckCircle2, UserCheck, Star, AlarmClock, Archive, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { CONTACT_TYPE_CONFIG } from '@/components/contacts/contactTypeConfig';
import { ConversationGroupHeader } from './conversation-list/ConversationGroupHeader';

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
  favoriteIds?: Set<string>;
  onSnooze?: (contactId: string) => void;
}

const ITEM_HEIGHT = 88;
const HEADER_HEIGHT = 32;
const EMPTY_SET = new Set<string>();

type FlatRow =
  | { kind: 'header'; key: string; label: string; count: number }
  | { kind: 'item'; key: string; conversation: ConversationWithMessages; isPinned: boolean };

function getConversationTime(c: ConversationWithMessages): number {
  if (c.lastMessage) return new Date(c.lastMessage.created_at).getTime();
  return new Date(c.contact.updated_at).getTime();
}

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
  favoriteIds = EMPTY_SET,
  onSnooze,
}: VirtualizedRealtimeListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const safeConversations = useMemo(() => {
    if (!Array.isArray(conversations)) return [];
    return conversations.filter(c => c?.contact?.id);
  }, [conversations]);

  // Ordem interna preservada — só particiona em grupos (Fixadas / Hoje / Ontem /
  // Mais antigas), não reordena dentro de cada grupo além do que o filtro já entrega.
  const flatRows = useMemo<FlatRow[]>(() => {
    const sorted = [...safeConversations].sort((a, b) => getConversationTime(b) - getConversationTime(a));

    const pinned = sorted.filter(c => pinnedIds.has(c.contact.id));
    const rest = sorted.filter(c => !pinnedIds.has(c.contact.id));

    const today = rest.filter(c => isToday(new Date(getConversationTime(c))));
    const yesterday = rest.filter(c => isYesterday(new Date(getConversationTime(c))));
    const older = rest.filter(c => !isToday(new Date(getConversationTime(c))) && !isYesterday(new Date(getConversationTime(c))));

    const rows: FlatRow[] = [];
    if (pinned.length > 0) {
      rows.push({ kind: 'header', key: 'group-pinned', label: 'Fixadas', count: pinned.length });
      pinned.forEach(c => rows.push({ kind: 'item', key: c.contact.id, conversation: c, isPinned: true }));
    }
    if (today.length > 0) {
      rows.push({ kind: 'header', key: 'group-today', label: 'Hoje', count: today.length });
      today.forEach(c => rows.push({ kind: 'item', key: c.contact.id, conversation: c, isPinned: false }));
    }
    if (yesterday.length > 0) {
      rows.push({ kind: 'header', key: 'group-yesterday', label: 'Ontem', count: yesterday.length });
      yesterday.forEach(c => rows.push({ kind: 'item', key: c.contact.id, conversation: c, isPinned: false }));
    }
    if (older.length > 0) {
      rows.push({ kind: 'header', key: 'group-older', label: 'Mais antigas', count: older.length });
      older.forEach(c => rows.push({ kind: 'item', key: c.contact.id, conversation: c, isPinned: false }));
    }
    return rows;
  }, [safeConversations, pinnedIds]);

  const getScrollElement = useCallback(() => parentRef.current, []);
  const estimateSize = useCallback((index: number) => (flatRows[index]?.kind === 'header' ? HEADER_HEIGHT : ITEM_HEIGHT), [flatRows]);

  // TanStack Virtual retorna funcoes nao memoizaveis pelo React Compiler — mesma
  // limitacao ja aceita na baseline do ratchet para este mesmo hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement,
    estimateSize,
    overscan: 8,
  });

  const handleClick = useCallback((contactId: string, e: React.SyntheticEvent) => {
    if (selectionMode && onToggleSelection) {
      e.preventDefault();
      onToggleSelection(contactId);
    } else {
      onSelectConversation(contactId);
    }
  }, [selectionMode, onToggleSelection, onSelectConversation]);

  if (flatRows.length === 0) {
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
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = flatRows[virtualRow.index];
          if (row.kind === 'header') {
            return (
              <div
                key={row.key}
                style={{
                  position: 'absolute', top: 0, left: 0, width: '100%',
                  height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <ConversationGroupHeader label={row.label} count={row.count} icon={row.key === 'group-pinned' ? Pin : undefined} />
              </div>
            );
          }
          const { conversation } = row;
          return (
            <ConversationRow
              key={row.key}
              conversation={conversation}
              virtualRow={virtualRow}
              selectedContactId={selectedContactId}
              isSelected={selectedIds.has(conversation.contact.id)}
              isPinned={row.isPinned}
              isFavorite={favoriteIds.has(conversation.contact.id)}
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
          );
        })}
      </div>
    </div>
  );
}

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
  isFavorite: boolean;
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
  isFavorite,
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
  const typeConfig = conversation.contact.contact_type ? CONTACT_TYPE_CONFIG[conversation.contact.contact_type] : null;
  const isVip = (conversation.contact.tags ?? []).some(t => t.toLowerCase() === 'vip');
  const isHighPriority = conversation.contact.ai_priority === 'high' || conversation.contact.ai_priority === 'urgent';
  const isWhatsapp = !conversation.contact.channel_type || conversation.contact.channel_type === 'whatsapp';

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
      className="px-3"
      data-testid="conversation-item"
    >
      <div
        className={cn(
          'w-full min-h-[72px] my-0.5 px-3 py-2.5 rounded-xl flex flex-col gap-1.5 transition-all text-left border group relative',
          selectedContactId === contactId ? 'bg-accent border-primary/40' : 'border-transparent hover:bg-muted/40',
          isSelected && 'bg-accent',
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
            {isWhatsapp && (
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-success flex items-center justify-center ring-2 ring-card">
                <MessageCircle className="w-2.5 h-2.5 text-success-foreground" />
              </span>
            )}
            {conversation.contact.ai_sentiment && (
              <span
                role="img"
                aria-label={`Sentimento: ${SENTIMENT_LABEL[conversation.contact.ai_sentiment] ?? conversation.contact.ai_sentiment}`}
                className={cn(
                  'absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-card',
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
                <span className="font-semibold text-foreground truncate text-[15px]">
                  {(() => {
                    const firstName = (conversation.contact.name || 'Sem nome').split(' ')[0];
                    const company = conversation.contact.company;
                    return company ? `${firstName} · ${company}` : firstName;
                  })()}
                </span>
                {conversation.contact.contact_type === 'sicoob_gifts' && (
                  <Gift className="w-3.5 h-3.5 text-info flex-shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {conversation.lastMessage && (
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(conversation.lastMessage.created_at), {
                      addSuffix: false,
                      locale: ptBR,
                    })}
                  </span>
                )}
                <button
                  aria-label={isFavorite ? 'Remover favorito' : 'Favoritar conversa'}
                  onClick={(e) => handleAction(e, onFavorite, 'Favoritar')}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="w-4 h-4 flex items-center justify-center text-muted-foreground/40 hover:text-warning transition-colors"
                >
                  <Star className={cn('w-3.5 h-3.5', isFavorite && 'fill-warning text-warning')} />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] text-muted-foreground truncate pr-2">
                {conversation.contact.contact_type === 'sicoob_gifts' && conversation.contact.company
                  ? `${conversation.contact.company} · ${conversation.lastMessage?.content || 'Sem mensagens'}`
                  : conversation.lastMessage?.content || 'Sem mensagens'}
              </p>
              {conversation.unreadCount > 0 && (
                <span className="flex-shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center text-[11px] font-bold bg-primary text-primary-foreground">
                  {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
                </span>
              )}
            </div>
            {(typeConfig || isVip || isHighPriority) && (
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                {typeConfig && (
                  <Badge variant="outline" className={cn('text-[11px] px-1.5 py-0 h-4 border', typeConfig.badgeClass)}>
                    {typeConfig.label}
                  </Badge>
                )}
                {isVip && (
                  <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-4 bg-warning/15 text-warning border-warning/40">VIP</Badge>
                )}
                {isHighPriority && (
                  <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-4 bg-destructive/15 text-destructive border-destructive/40">Alta prioridade</Badge>
                )}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Hover action buttons */}
        <div className="absolute bottom-2 left-0 right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto transition-all duration-150 pl-[60px]">
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
