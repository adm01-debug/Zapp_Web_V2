import { cn } from '@/lib/utils';

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  novo_contato:  { label: 'Novo contato',  color: 'bg-muted text-muted-foreground' },
  qualificando:  { label: 'Qualificando',  color: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  apresentando:  { label: 'Apresentando',  color: 'bg-purple-500/15 text-purple-600 dark:text-purple-400' },
  negociando:    { label: 'Negociando',    color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  fechando:      { label: 'Fechando',      color: 'bg-primary/15 text-primary' },
  pos_venda:     { label: 'Pós-venda',     color: 'bg-success/15 text-success' },
  perdido:       { label: 'Perdido',       color: 'bg-destructive/15 text-destructive' },
};

interface StageIndicatorProps {
  stage: string;
  temperature: number;
  className?: string;
}

export function StageIndicator({ stage, temperature, className }: StageIndicatorProps) {
  const cfg = STAGE_CONFIG[stage] ?? { label: stage, color: 'bg-muted text-muted-foreground' };
  const heatColor = temperature >= 70 ? 'text-orange-500' : temperature >= 40 ? 'text-amber-500' : 'text-muted-foreground';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', cfg.color)}>
        {cfg.label}
      </span>
      <div className="flex items-center gap-1 ml-auto">
        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary/60 to-primary transition-all"
            style={{ width: `${temperature}%` }}
          />
        </div>
        <span className={cn('text-[11px] font-medium', heatColor)}>{temperature}°</span>
      </div>
    </div>
  );
}
