/**
 * CV-075 — DiscountGuardrailBanner
 *
 * Banner de aviso quando vendedor está prestes a dar desconto impulsivo.
 */
import { ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DiscountGuardrailResult } from '@/hooks/copilot/useDiscountGuardrail';

interface DiscountGuardrailBannerProps {
  result: DiscountGuardrailResult;
  onSelectAlternative: (text: string) => void;
  onDismiss: () => void;
  className?: string;
}

export function DiscountGuardrailBanner({ result, onSelectAlternative, onDismiss, className }: DiscountGuardrailBannerProps) {
  if (!result.detected) return null;
  return (
    <div className={cn('rounded-lg border border-red-400/30 bg-red-50/50 dark:bg-red-900/10 p-3', className)}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-red-500 shrink-0" />
          <span className="text-xs font-medium text-red-700 dark:text-red-400">
            {result.warningMessage}
          </span>
        </div>
        <button type="button" onClick={onDismiss} className="text-muted-foreground hover:text-foreground text-xs">×</button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {result.valueAlternatives.slice(0, 4).map((alt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelectAlternative(alt)}
            className="text-3xs rounded-full border border-border/50 px-2 py-0.5 hover:bg-muted/60 transition-colors"
          >
            {alt}
          </button>
        ))}
      </div>
    </div>
  );
}
