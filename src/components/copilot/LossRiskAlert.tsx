/**
 * CV-079: Loss risk alert — color-coded by risk level with signals and recovery script.
 */
import React from 'react';
import { X, AlertTriangle, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { LossRiskState, LossRiskLevel, LossSignal } from '@/hooks/copilot/useLossRiskDetector';

const LEVEL_STYLES: Record<
  Exclude<LossRiskLevel, 'none'>,
  { border: string; bg: string; badge: string; icon: typeof AlertTriangle }
> = {
  low: {
    border: 'border-yellow-400',
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    icon: AlertTriangle,
  },
  medium: {
    border: 'border-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    icon: AlertTriangle,
  },
  high: {
    border: 'border-red-400',
    bg: 'bg-red-50 dark:bg-red-900/20',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    icon: AlertCircle,
  },
  critical: {
    border: 'border-red-600',
    bg: 'bg-red-100 dark:bg-red-900/30',
    badge: 'bg-red-600 text-white',
    icon: AlertCircle,
  },
};

const LEVEL_LABELS: Record<LossRiskLevel, string> = {
  none: '',
  low: 'Risco Baixo',
  medium: 'Risco Médio',
  high: 'Risco Alto',
  critical: 'Risco Crítico',
};

const SIGNAL_LABELS: Record<LossSignal['type'], string> = {
  delay: 'Indecisão',
  sentiment_drop: 'Queda de engajamento',
  short_responses: 'Respostas curtas',
  competitor_mention: 'Menção de concorrente',
  explicit_no: 'Recusa explícita',
};

export interface LossRiskAlertProps {
  riskState: LossRiskState;
  onDismiss: () => void;
  className?: string;
}

export function LossRiskAlert({ riskState, onDismiss, className }: LossRiskAlertProps) {
  if (riskState.level === 'none') return null;

  const styles = LEVEL_STYLES[riskState.level];
  const Icon = styles.icon;

  return (
    <Alert className={`${styles.bg} ${styles.border} border ${className ?? ''}`}>
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 mt-0.5 shrink-0 text-current" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Badge className={`text-xs ${styles.badge}`} variant="secondary">
              {LEVEL_LABELS[riskState.level]}
            </Badge>
            <span className="text-xs text-muted-foreground">Score: {riskState.score}</span>
            <div className="flex gap-1 flex-wrap">
              {riskState.signals.map((signal, i) => (
                <Badge key={i} variant="outline" className="text-xs py-0 px-1">
                  {SIGNAL_LABELS[signal.type]}
                </Badge>
              ))}
            </div>
          </div>

          {riskState.recoveryScript.length > 0 && (
            <AlertDescription>
              <p className="text-xs font-medium text-muted-foreground mb-1">Script de recuperação:</p>
              <ol className="space-y-1">
                {riskState.recoveryScript.map((step, i) => (
                  <li key={i} className="text-xs text-foreground leading-relaxed">
                    {step}
                  </li>
                ))}
              </ol>
            </AlertDescription>
          )}

          {riskState.followUpTask && (
            <p className="text-xs text-muted-foreground mt-1.5 italic">
              ⏰ {riskState.followUpTask}
            </p>
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
