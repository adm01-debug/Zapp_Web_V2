/**
 * CV-075: Discount guardrail UI — shows suggestion, trade alternatives, and approval flow.
 */
import React from 'react';
import { X, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PriceAnchorSuggestion } from '@/hooks/copilot/usePriceAnchor';

export interface DiscountGuardrailProps {
  suggestion: PriceAnchorSuggestion | null;
  onDismiss: () => void;
  className?: string;
}

const TYPE_STYLES = {
  anchor: {
    icon: CheckCircle2,
    color: 'text-green-600',
    border: 'border-green-400',
    bg: 'bg-green-50 dark:bg-green-900/20',
  },
  discount_refused: {
    icon: AlertTriangle,
    color: 'text-red-600',
    border: 'border-red-400',
    bg: 'bg-red-50 dark:bg-red-900/20',
  },
  trade_offer: {
    icon: RefreshCw,
    color: 'text-amber-600',
    border: 'border-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
  },
};

export function DiscountGuardrail({ suggestion, onDismiss, className }: DiscountGuardrailProps) {
  if (!suggestion) return null;

  const styles = TYPE_STYLES[suggestion.type];
  const Icon = styles.icon;

  return (
    <Alert className={`${styles.bg} ${styles.border} border relative ${className ?? ''}`}>
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${styles.color}`} />
        <div className="flex-1 min-w-0">
          <AlertDescription className="text-xs text-foreground leading-relaxed">
            {suggestion.message}
          </AlertDescription>

          {suggestion.tradeOptions && suggestion.tradeOptions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {suggestion.tradeOptions.map((opt, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="text-xs py-0.5 px-1.5 cursor-default whitespace-normal text-left h-auto"
                >
                  {opt}
                </Badge>
              ))}
            </div>
          )}

          {suggestion.type === 'discount_refused' && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-6 text-xs border-red-400 text-red-700 hover:bg-red-50"
            >
              Solicitar aprovação do gestor
            </Button>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={onDismiss}>
          <X className="h-3 w-3" />
          <span className="sr-only">Dispensar</span>
        </Button>
      </div>
    </Alert>
  );
}
