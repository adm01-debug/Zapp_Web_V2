/**
 * CV-122 — CoachingTipBanner
 *
 * Banner discreto de coaching para o vendedor (modo whisper).
 */
import { Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CoachingTip } from '@/hooks/copilot/useCoachingTip';

interface CoachingTipBannerProps {
  tips: CoachingTip[];
  onDismiss?: () => void;
  className?: string;
}

export function CoachingTipBanner({ tips, onDismiss, className }: CoachingTipBannerProps) {
  const tip = tips[0];
  if (!tip) return null;

  return (
    <div className={cn(
      'flex items-start gap-1.5 rounded-lg border p-2.5',
      tip.priority === 'high'
        ? 'border-orange-500/30 bg-orange-50/50 dark:bg-orange-900/10'
        : 'border-border/50 bg-muted/30',
      className
    )}>
      <Lightbulb className={cn(
        'w-3.5 h-3.5 shrink-0 mt-0.5',
        tip.priority === 'high' ? 'text-orange-500' : 'text-muted-foreground'
      )} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground/80">{tip.tip}</p>
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-muted-foreground hover:text-foreground text-xs shrink-0">×</button>
      )}
    </div>
  );
}
