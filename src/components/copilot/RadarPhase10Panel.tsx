/**
 * CV-091-100 — RadarPhase10Panel
 *
 * Painel RADAR da Fase 10: termômetro de lead, sinais de compra, speed-to-lead, follow-up.
 */
import { cn } from '@/lib/utils';
import { useLeadThermometer } from '@/hooks/copilot/useLeadThermometer';
import { usePurchaseSignals } from '@/hooks/copilot/usePurchaseSignals';
import { useSpeedToLead } from '@/hooks/copilot/useSpeedToLead';
import { Thermometer, Zap, CheckCircle2 } from 'lucide-react';

const TEMP_COLORS: Record<string, string> = {
  cold: 'text-blue-500',
  warm: 'text-yellow-500',
  hot: 'text-orange-500',
};

const TEMP_LABELS: Record<string, string> = {
  cold: '❄️ Frio',
  warm: '🌤 Morno',
  hot: '🔥 Quente',
};

export interface RadarPhase10PanelProps {
  lastClientMessage: string;
  messages: Array<{ content: string; sender: string }>;
  firstClientMessageAt?: Date | string | null;
  lastAgentMessageAt?: Date | string | null;
  onDraftText: (text: string) => void;
  className?: string;
}

export function RadarPhase10Panel({
  lastClientMessage,
  messages,
  firstClientMessageAt,
  lastAgentMessageAt,
  onDraftText,
  className,
}: RadarPhase10PanelProps) {
  const thermometer = useLeadThermometer({ messages });
  const purchaseSignalsList = usePurchaseSignals({ clientText: lastClientMessage });
  const speedToLead = useSpeedToLead({ firstClientMessageAt, lastAgentMessageAt });
  const isReadyToClose = purchaseSignalsList.some((s) => s.type === 'explicit');
  const closingDraft = isReadyToClose ? 'Ótimo! Posso adiantar o pedido agora. Me passa os dados para emissão da NF?' : '';

  const showThermometer = thermometer.temperature !== 'cold' || thermometer.signals.length > 0;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Speed-to-lead alert */}
      {speedToLead && speedToLead.urgency !== 'ok' && (
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg border p-2.5 text-xs',
            speedToLead.urgency === 'critical'
              ? 'border-red-500/50 bg-red-50 dark:bg-red-950/20'
              : 'border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20',
          )}
        >
          <Zap className={cn('w-3.5 h-3.5 shrink-0 mt-0.5', speedToLead.urgency === 'critical' ? 'text-red-500' : 'text-yellow-500')} />
          <div>
            <p className="font-medium">{speedToLead.alertMessage}</p>
            <p className="text-muted-foreground mt-0.5">{speedToLead.actionHint}</p>
          </div>
        </div>
      )}

      {/* Termômetro */}
      {showThermometer && (
        <div className="rounded-lg border border-border/40 p-2.5 text-xs">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Thermometer className={cn('w-3.5 h-3.5', TEMP_COLORS[thermometer.temperature])} />
            <span className="font-medium">Lead: {TEMP_LABELS[thermometer.temperature]}</span>
            <span className="text-muted-foreground">(score: {thermometer.score})</span>
          </div>
          <p className="text-muted-foreground">{thermometer.recommendedAction}</p>
          {thermometer.signals.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {thermometer.signals.slice(0, 3).map((s) => (
                <li key={s} className="text-muted-foreground/70">· {s}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Sinais de compra */}
      {isReadyToClose && (
        <div className="flex items-start gap-2 rounded-lg border border-green-500/50 bg-green-50 dark:bg-green-950/20 p-2.5 text-xs">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-500" />
          <div className="flex-1">
            <p className="font-medium text-green-700 dark:text-green-400">Pronto para fechar!</p>
            <ul className="mt-0.5 space-y-0.5">
              {purchaseSignalsList.map((s) => (
                <li key={s.signal} className="text-muted-foreground">✓ {s.signal}</li>
              ))}
            </ul>
            {closingDraft && (
              <button
                type="button"
                onClick={() => onDraftText(closingDraft)}
                className="mt-1 text-3xs text-primary font-medium hover:underline"
              >
                Usar script de fechamento →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
