import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/auth/useAuth';
import { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

export type MainTab = 'open' | 'resolved' | 'search';
export type SubTab = 'attending' | 'waiting';
export type ChipTab = 'all' | 'unread' | 'attending' | 'waiting' | 'resolved';

interface TicketTabsProps {
  conversations: ConversationWithMessages[];
  chipTab: ChipTab;
  onChipTabChange: (tab: ChipTab) => void;
}

export function TicketTabs({ conversations, chipTab, onChipTabChange }: TicketTabsProps) {
  const { user } = useAuth();

  const counts = useMemo(() => {
    const userId = user?.id;
    const openConversations = conversations.filter(c => c.messages.length > 0);

    const attending = openConversations.filter(c => c.contact.assigned_to === userId);
    const waiting = openConversations.filter(c => !c.contact.assigned_to);
    const unread = openConversations.filter(c => {
      const unreadMessages = (c.contact as unknown as { unread_messages?: number }).unread_messages ?? 0;
      return (c.unreadCount ?? 0) > 0 || unreadMessages > 0;
    });
    const resolved = conversations.filter(c => c.messages.length === 0);

    return {
      all: openConversations.length,
      unread: unread.length,
      attending: attending.length,
      waiting: waiting.length,
      resolved: resolved.length,
    };
  }, [conversations, user?.id]);

  const chips: { id: ChipTab; label: string; count: number }[] = [
    { id: 'all', label: 'Todas', count: counts.all },
    { id: 'unread', label: 'Não lidas', count: counts.unread },
    { id: 'attending', label: 'Em atendimento', count: counts.attending },
    { id: 'waiting', label: 'Aguardando', count: counts.waiting },
    { id: 'resolved', label: 'Resolvidas', count: counts.resolved },
  ];

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
      {chips.map(chip => {
        const isActive = chipTab === chip.id;
        return (
          <button
            key={chip.id}
            onClick={() => onChipTabChange(chip.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-all shrink-0',
              isActive
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent'
            )}
          >
            {chip.label}
            <Badge
              variant="outline"
              className={cn(
                'h-4 min-w-[16px] px-1 text-[9px] font-bold leading-none border',
                isActive
                  ? 'bg-primary/15 text-primary border-primary/30'
                  : 'bg-transparent text-muted-foreground border-border/60'
              )}
            >
              {chip.count}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
