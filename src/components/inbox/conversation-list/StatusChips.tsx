import { useMemo } from 'react';
import { Archive } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/auth/useAuth';
import { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import { countByChip } from '@/hooks/inbox/chipCounts';

export type MainTab = 'open' | 'resolved' | 'search';
export type SubTab = 'attending' | 'waiting';
export type ChipTab = 'all' | 'unread' | 'attending' | 'waiting' | 'resolved' | 'archived';

interface StatusChipsProps {
  conversations: ConversationWithMessages[];
  chipTab: ChipTab;
  onChipTabChange: (tab: ChipTab) => void;
  /** Adiamentos vigentes (R2-INB-029): a lista e o contador os excluem igual. */
  snoozedIds?: Set<string> | null;
  /** "Mostrar todos" da lista: Em atendimento passa a acompanhar Todas. */
  showAll?: boolean;
  /** Fila selecionada; a lista aplica por cima dos chips abertos e de Arquivadas. */
  selectedQueueId?: string | null;
}

const COUNTER_TONE: Record<ChipTab, { active: string; inactive: string }> = {
  all: { active: 'bg-primary text-primary-foreground', inactive: 'bg-primary text-primary-foreground' },
  unread: { active: 'bg-destructive/20 text-destructive', inactive: 'bg-destructive/20 text-destructive' },
  attending: { active: 'bg-muted text-foreground', inactive: 'bg-muted text-foreground' },
  waiting: { active: 'bg-warning/20 text-warning', inactive: 'bg-warning/20 text-warning' },
  resolved: { active: 'bg-muted text-foreground', inactive: 'bg-muted text-foreground' },
  archived: { active: 'bg-muted text-foreground', inactive: 'bg-muted text-foreground' },
};

export function StatusChips({ conversations, chipTab, onChipTabChange, snoozedIds, showAll, selectedQueueId }: StatusChipsProps) {
  const { profile } = useAuth();

  // Contadores pelas MESMAS regras da lista (src/hooks/inbox/chipCounts.ts), que
  // useInboxFilters aplica em filteredConversations: o número do chip é o length
  // que a lista mostra ao clicar nele. As regras antigas (Resolvidas = sem
  // mensagem carregada, Aguardando = sem responsável) davam número divergente do
  // estado persistido `contacts.conversation_status`.
  const counts = useMemo(
    () => countByChip(conversations, profile?.id, { snoozedIds, showAll, selectedQueueId }),
    [conversations, profile?.id, snoozedIds, showAll, selectedQueueId],
  );

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
