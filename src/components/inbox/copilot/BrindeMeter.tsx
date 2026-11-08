import { cn } from '@/lib/utils';

const BRINDE_LETTERS = [
  { key: 'B', label: 'Budget', description: 'Orçamento' },
  { key: 'R', label: 'Responsible', description: 'Responsável' },
  { key: 'I', label: 'Intention', description: 'Finalidade' },
  { key: 'N', label: 'Need', description: 'Quantidade' },
  { key: 'D', label: 'Deadline', description: 'Prazo' },
  { key: 'E', label: 'Engagement', description: 'Engajamento' },
] as const;

interface BrindeMeterProps {
  meter: number; // 0-6
  evidence?: Record<string, string | null>;
  className?: string;
}

export function BrindeMeter({ meter, evidence = {}, className }: BrindeMeterProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">B·R·I·N·D·E</span>
        <span className="text-xs font-bold text-foreground">{meter}/6</span>
      </div>
      <div className="flex gap-1">
        {BRINDE_LETTERS.map((l, i) => {
          const filled = i < meter;
          const hasEvidence = Boolean(evidence[l.key]);
          return (
            <div
              key={l.key}
              title={`${l.label}: ${l.description}${hasEvidence ? ' ✓' : ''}`}
              className={cn(
                'flex-1 h-7 rounded flex items-center justify-center text-[11px] font-bold transition-colors',
                filled
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/40 text-muted-foreground',
                hasEvidence && !filled && 'bg-primary/20 text-primary',
              )}
            >
              {l.key}
            </div>
          );
        })}
      </div>
      {meter === 6 && (
        <p className="text-[11px] text-success font-medium text-center">
          🎉 Briefing completo!
        </p>
      )}
    </div>
  );
}
