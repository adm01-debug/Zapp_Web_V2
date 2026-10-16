import { useMemo } from 'react';
import { Archive } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/auth/useAuth';
import { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import { countByChip, type ChipCounts, type ChipCountOpts } from '@/hooks/inbox/chipCounts';

export type MainTab = 'open' | 'resolved' | 'search';
export type SubTab = 'attending' | 'waiting';
export type ChipTab = 'all' | 'unread' | 'attending' | 'waiting' | 'resolved' | 'archived';

interface StatusChipsProps {
  conversations?: ConversationWithMessages[];
  counts?: ChipCounts;
  countOpts?: ChipCountOpts;
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

function StatusChipsWithConversations({ conversations = [], countOpts, ...props }: StatusChipsProps) {
  // R2-INB-056 (#349): contacts.assigned_to é FK para public.profiles(id), que
  // é um id DIFERENTE do auth.users.id exposto em `user`. Comparar o
  // responsável com o auth id zerava "Em atendimento" (e divergia do filtro da
  // lista, que usa profileId em useInboxFilters).
  const { profile } = useAuth();

  const counts = useMemo(() => countByChip(conversations, profile?.id, countOpts),
    [conversations, profile?.id, countOpts]);
  return <StatusChips {...props} counts={counts} />;
}

export function StatusChips(props: StatusChipsProps) {
  if (!props.counts) return <StatusChipsWithConversations {...props} />;
  const { counts, chipTab, onChipTabChange } = props;

  const chips: { id: ChipTab; label: string; count: number; icon?: LucideIcon }[] = [
    { id: 'all', label: 'Todas', count: counts.all },
    { id: 'unread', label: 'Não lidas', count: counts.unread },
    { id: 'attending', label: 'Em atendimento', count: counts.attending },
    { id: 'waiting', label: 'Aguardando', count: counts.waiting },
    { id: 'resolved', label: 'Resolvidas', count: counts.resolved },
    { id: 'archived', label: 'Arquivadas', count: counts.archived, icon: Archive },
  ];

  return (
    <div className="flex flex-wrap gap-2 px-4 pt-3 pb-3" data-testid="status-chips" role="group" aria-label="Filtros de conversa">
      {chips.map(chip => {
        const isActive = chipTab === chip.id;
        const tone = COUNTER_TONE[chip.id];
        return (
          <button
            key={chip.id}
            data-testid={`status-chip-${chip.id}`}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChipTabChange(chip.id)}
            className={cn(
              'h-11 px-4 rounded-full text-[15px] font-medium border transition-colors flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
              isActive
                ? 'status-chip-active bg-accent border-primary ring-2 ring-primary/40 text-foreground'
                : 'bg-muted/40 border-border text-foreground hover:bg-muted/70'
            )}
          >
            {chip.icon ? <chip.icon className="h-4 w-4 mr-1" aria-hidden="true" /> : null}
            {chip.label}
            <span
              className={cn(
                'ml-1.5 h-7 min-w-7 px-2 rounded-full text-sm font-bold flex items-center justify-center',
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
