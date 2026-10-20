import { useMemo } from 'react';
import { Archive } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/auth/useAuth';
import { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

export type MainTab = 'open' | 'resolved' | 'search';
export type SubTab = 'attending' | 'waiting';
export type ChipTab = 'all' | 'unread' | 'attending' | 'waiting' | 'resolved' | 'archived';

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
  archived: { active: 'bg-muted text-foreground', inactive: 'bg-muted text-foreground' },
};

export function StatusChips({ conversations, chipTab, onChipTabChange }: StatusChipsProps) {
  // R2-INB-056 (#349): contacts.assigned_to é FK para public.profiles(id), que
  // é um id DIFERENTE do auth.users.id exposto em `user`. Comparar o
  // responsável com o auth id zerava "Em atendimento" (e divergia do filtro da
  // lista, que usa profileId em useInboxFilters).
  const { profile } = useAuth();

  const counts = useMemo(() => {
    const profileId = profile?.id;
    // Arquivadas saem dos contadores de lista ativa: o status persiste em
    // contacts.conversation_status ('archived'), não no proxy "sem mensagens".
    const openConversations = conversations.filter(
      c => c.messages.length > 0 && c.contact.conversation_status !== 'archived'
    );

    const attending = openConversations.filter(c => profileId != null && c.contact.assigned_to === profileId);
    const waiting = openConversations.filter(c => !c.contact.assigned_to);
    const unread = openConversations.filter(c => {
      const unreadMessages = (c.contact as unknown as { unread_messages?: number }).unread_messages ?? 0;
      return (c.unreadCount ?? 0) > 0 || unreadMessages > 0;
    });
    const resolved = conversations.filter(c => c.messages.length === 0);
    const archived = conversations.filter(c => c.contact.conversation_status === 'archived');

    return {
      all: openConversations.length,
      unread: unread.length,
      attending: attending.length,
      waiting: waiting.length,
      resolved: resolved.length,
      archived: archived.length,
    };
  }, [conversations, profile?.id]);

  const chips: { id: ChipTab; label: string; count: number; icon?: LucideIcon }[] = [
    { id: 'all', label: 'Todas', count: counts.all },
    { id: 'unread', label: 'Não lidas', count: counts.unread },
    { id: 'attending', label: 'Em atendimento', count: counts.attending },
    { id: 'waiting', label: 'Aguardando', count: counts.waiting },
    { id: 'resolved', label: 'Resolvidas', count: counts.resolved },
    { id: 'archived', label: 'Arquivadas', count: counts.archived, icon: Archive },
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
                ? 'status-chip-active bg-accent border-primary/50 text-foreground'
                : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted/70'
            )}
          >
            {chip.icon ? <chip.icon className="h-3 w-3 mr-1" aria-hidden="true" /> : null}
            {chip.label}
            <span
              className={cn(
                'ml-1.5 h-[18px] min-w-[18px] px-1 rounded-md text-2xs font-bold flex items-center justify-center',
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
