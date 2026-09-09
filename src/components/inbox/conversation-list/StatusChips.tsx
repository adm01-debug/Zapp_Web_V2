import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/auth/useAuth';
import { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

export type MainTab = 'open' | 'resolved' | 'search';
export type SubTab = 'attending' | 'waiting';
export type ChipTab = 'all' | 'unread' | 'attending' | 'waiting' | 'resolved';

interface StatusChipsProps {
  conversations: ConversationWithMessages[];
  chipTab: ChipTab;
  onChipTabChange: (tab: ChipTab) => void;
}

const COUNTER_TONE: Record<ChipTab, { active: string; inactive: string }> = {
  all: { active: 'bg-primary text-primary-foreground', inactive: 'bg-primary text-primary-foreground' },
  unread: { active: 'bg-destructive/20 text-destructive', inactive: 'bg-destructive/20 text-destructive' },
  attending: { active: 'bg-muted text-foreground', inactive: 'bg-muted text-foreground' },
  waiting: { active: 'bg-warning/20 text-warning', inactive: 'bg-warning/20 text-warning' },
  resolved: { active: 'bg-muted text-foreground', inactive: 'bg-muted text-foreground' },
};

export function StatusChips({ conversations, chipTab, onChipTabChange }: StatusChipsProps) {
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
    <div className="flex flex-wrap gap-1.5 px-4 pb-3" data-testid="status-chips">
      {chips.map(chip => {
        const isActive = chipTab === chip.id;
        const tone = COUNTER_TONE[chip.id];
        return (
          <button
            key={chip.id}
            data-testid={`status-chip-${chip.id}`}
            onClick={() => onChipTabChange(chip.id)}
            className={cn(
              'h-7 px-2.5 rounded-lg text-xs font-medium border transition-all flex items-center',
              isActive
                ? 'bg-accent border-primary/50 text-foreground'
                : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted/70'
            )}
          >
            {chip.label}
            <span
              className={cn(
                'ml-1.5 h-[18px] min-w-[18px] px-1 rounded-md text-[11px] font-bold flex items-center justify-center',
                isActive ? tone.active : tone.inactive
              )}
            >
              {chip.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
