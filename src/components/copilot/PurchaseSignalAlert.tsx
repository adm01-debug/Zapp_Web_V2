/**
 * CV-092 — PurchaseSignalAlert
 *
 * Alerta compacto quando sinais de compra são detectados.
 */
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PurchaseSignal } from '@/hooks/copilot/usePurchaseSignals';

interface PurchaseSignalAlertProps {
  signals: PurchaseSignal[];
  className?: string;
}

export function PurchaseSignalAlert({ signals, className }: PurchaseSignalAlertProps) {
  if (signals.length === 0) return null;
  const topSignal = signals[0];

  return (
    <div className={cn('flex items-start gap-1.5 rounded-lg border border-green-500/30 bg-green-50/50 dark:bg-green-900/10 p-2.5', className)}>
      <Zap className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-medium text-green-700 dark:text-green-400">
          Sinal de compra detectado
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{topSignal.signal}</p>
        {signals.length > 1 && (
          <p className="text-3xs text-muted-foreground mt-0.5">+{signals.length - 1} sinal(is)</p>
        )}
      </div>
    </div>
  );
}
