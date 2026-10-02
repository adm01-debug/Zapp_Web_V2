import { type ReactNode } from 'react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface SinguProfileTileProps {
  /** sufixo do data-testid: `singu-tile-<name>` */
  name: 'disc' | 'vak' | 'big_five' | 'mbti' | 'enneagram' | 'temperament';
  icon: ReactNode;
  label: string;
  /** valor principal ("D Dominante (DI)", "Visual", …) — null = "Não avaliado" */
  value: string | null;
  /** barra 0–100 da métrica (3.4); null = sem barra, nunca barra em 0 "para preencher" */
  bar?: number | null;
}

/**
 * Mini card da grade 2×3 do Perfil Singu (etapas 68–75): ícone 20px, nome,
 * valor 11px muted e `Progress` 4px só quando há métrica.
 */
export function SinguProfileTile({ name, icon, label, value, bar }: SinguProfileTileProps) {
  const hasData = value !== null;
  const barValue = typeof bar === 'number' && Number.isFinite(bar) ? Math.max(0, Math.min(100, bar)) : null;
  return (
    <div data-testid={`singu-tile-${name}`} className="min-h-16 rounded-lg border border-border bg-card p-2 flex flex-col justify-between gap-1">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={cn('w-5 h-5 flex items-center justify-center shrink-0 [&>svg]:w-4 [&>svg]:h-4', hasData ? 'text-foreground' : 'text-muted-foreground/40')}>
          {icon}
        </span>
        <span className="text-xs font-medium text-foreground truncate">{label}</span>
      </div>
      <span className="text-3xs text-muted-foreground truncate" title={value ?? 'Não avaliado'}>
        {value ?? 'Não avaliado'}
      </span>
      {barValue !== null && (
        <Progress value={barValue} className="h-1" aria-label={`${label}: ${barValue}%`} />
      )}
    </div>
  );
}
