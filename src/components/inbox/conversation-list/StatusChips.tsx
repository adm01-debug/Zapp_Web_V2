import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

export type MainTab = 'open' | 'resolved' | 'search';
export type SubTab = 'attending' | 'waiting';
export type ChipTab = 'all' | 'unread' | 'attending' | 'waiting' | 'resolved';

interface StatusChipsProps {
  conversations: ConversationWithMessages[];
  chipTab: ChipTab;
  onChipTabChange: (tab: ChipTab) => void;
  profileId?: string;
}

const CHIP_META: ReadonlyArray<{
  id: ChipTab;
  label: string;
  countClassName: string;
}> = [
  { id: 'all', label: 'Todas', countClassName: 'bg-primary text-primary-foreground' },
  { id: 'unread', label: 'Não lidas', countClassName: 'bg-destructive/15 text-destructive' },
  { id: 'attending', label: 'Em atendimento', countClassName: 'bg-muted text-foreground' },
  { id: 'waiting', label: 'Aguardando', countClassName: 'bg-warning/15 text-warning' },
  { id: 'resolved', label: 'Resolvidas', countClassName: 'bg-muted text-foreground' },
];

function hasUnread(conversation: ConversationWithMessages) {
  const storedUnread = (conversation.contact as { unread_messages?: number }).unread_messages ?? 0;
  return (conversation.unreadCount ?? 0) > 0 || storedUnread > 0;
}

function isResolved(conversation: ConversationWithMessages) {
  const status = conversation.contact.conversation_status;
  if (status) return status === 'resolved' || status === 'archived';
  return conversation.messages.length === 0;
}

export function StatusChips({
  conversations,
  chipTab,
  onChipTabChange,
  profileId,
}: StatusChipsProps) {
  const counts = useMemo(() => {
    const valid = conversations.filter((conversation) => conversation?.contact?.id);
    const open = valid.filter((conversation) => !isResolved(conversation));

    return {
      all: open.length,
      unread: open.filter(hasUnread).length,
      attending: open.filter((conversation) => conversation.contact.assigned_to === profileId).length,
      waiting: open.filter((conversation) => !conversation.contact.assigned_to || conversation.contact.conversation_status === 'waiting').length,
      resolved: valid.length - open.length,
    } satisfies Record<ChipTab, number>;
  }, [conversations, profileId]);

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por status da conversa">
      {CHIP_META.map((chip) => {
        const active = chipTab === chip.id;
        return (
          <button
            key={chip.id}
            type="button"
            aria-pressed={active}
            data-testid={`status-chip-${chip.id}`}
            onClick={() => onChipTabChange(chip.id)}
            className={cn(
              'flex h-7 items-center whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium transition-colors',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'border-primary/50 bg-accent text-foreground'
                : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground',
            )}
          >
            {chip.label}
            <span
              className={cn(
                'ml-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-md px-1',
                'text-[11px] font-bold tabular-nums',
                chip.countClassName,
              )}
            >
              {counts[chip.id].toLocaleString('pt-BR')}
            </span>
          </button>
        );
      })}
    </div>
  );
}
