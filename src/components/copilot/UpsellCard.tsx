/**
 * CV-088 — UpsellCard
 *
 * Card de sugestão de upsell/cross-sell baseado no produto detectado.
 */
import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UpsellSuggestion } from '@/hooks/copilot/useUpsellSuggestion';

interface UpsellCardProps {
  suggestions: UpsellSuggestion[];
  onUseSuggestion?: (text: string) => void;
  className?: string;
}

export function UpsellCard({ suggestions, onUseSuggestion, className }: UpsellCardProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className={cn('rounded-lg border border-purple-500/30 bg-purple-50/50 dark:bg-purple-900/10 p-3', className)}>
      <div className="flex items-center gap-1.5">
        <TrendingUp className="w-3.5 h-3.5 text-purple-500 shrink-0" />
        <span className="text-xs font-medium text-purple-700 dark:text-purple-400">
          Oportunidade de upgrade
        </span>
      </div>
      <div className="mt-2 space-y-1.5">
        {suggestions.slice(0, 2).map((s, i) => (
          <div key={i} className="text-xs">
            <div className="flex items-center gap-1">
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-3xs font-medium',
                s.type === 'upsell'
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-800 dark:text-purple-200'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200'
              )}>
                {s.type === 'upsell' ? 'upgrade' : 'combo'}
              </span>
              <span className="text-foreground/80">{s.productSuggestion}</span>
            </div>
            <p className="mt-0.5 text-muted-foreground">{s.reason}</p>
            {onUseSuggestion && (
              <button
                type="button"
                className="mt-0.5 text-primary hover:underline"
                onClick={() => onUseSuggestion(s.script)}
              >
                Usar script
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
