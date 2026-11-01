import { Archive } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MainTab = 'open' | 'resolved' | 'search';
export type SubTab = 'attending' | 'waiting';
export type ChipTab = 'all' | 'unread' | 'attending' | 'waiting' | 'resolved' | 'archived';
export type ChipCounts = Record<ChipTab, number>;

interface StatusChipsProps {
  counts: ChipCounts;
  chipTab: ChipTab;
  onChipTabChange: (tab: ChipTab) => void;
  countOpts?: unknown;
}

const COUNTER_TONE: Record<ChipTab, { active: string; inactive: string }> = {
  all: { active: 'bg-primary text-primary-foreground', inactive: 'bg-primary text-primary-foreground' },
  unread: { active: 'bg-destructive/20 text-destructive', inactive: 'bg-destructive/20 text-destructive' },
  attending: { active: 'bg-muted text-foreground', inactive: 'bg-muted text-foreground' },
  waiting: { active: 'bg-warning/20 text-warning', inactive: 'bg-warning/20 text-warning' },
  resolved: { active: 'bg-muted text-foreground', inactive: 'bg-muted text-foreground' },
  archived: { active: 'bg-muted text-foreground', inactive: 'bg-muted text-foreground' },
};

export function StatusChips({ counts, chipTab, onChipTabChange }: StatusChipsProps) {
  const chips: { id: ChipTab; label: string; count: number; icon?: LucideIcon }[] = [
    { id: 'all', label: 'Todas', count: counts.all },
    { id: 'unread', label: 'Não lidas', count: counts.unread },
    { id: 'attending', label: 'Em atendimento', count: counts.attending },
    { id: 'waiting', label: 'Aguardando', count: counts.waiting },
    { id: 'resolved', label: 'Resolvidas', count: counts.resolved },
    { id: 'archived', label: 'Arquivadas', count: counts.archived, icon: Archive },
  ];

  return (
    <div className="flex flex-wrap gap-1.5 px-4 pb-3" data-testid="status-chips" role="tablist" aria-label="Filtros de conversa">
      {chips.map(chip => {
        const isActive = chipTab === chip.id;
        const tone = COUNTER_TONE[chip.id];
        return (
          <button
            key={chip.id}
            data-testid={`status-chip-${chip.id}`}
            role="tab"
            aria-selected={isActive}
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
