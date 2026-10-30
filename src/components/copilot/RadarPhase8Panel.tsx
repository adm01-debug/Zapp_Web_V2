/**
 * CV-071-080 — RadarPhase8Panel
 *
 * Painel RADAR da Fase 8: detecção e tratamento de objeções.
 * Compõe: ObjectionCard, BattleCard, DiscountGuardrail, TradeOffer, StallAlert.
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ObjectionCard } from './ObjectionCard';
import { useObjectionHandler } from '@/hooks/copilot/useObjectionHandler';
import { useBattleCard } from '@/hooks/copilot/useBattleCard';
import { useDiscountGuardrail } from '@/hooks/copilot/useDiscountGuardrail';
import { useStallDetector } from '@/hooks/copilot/useStallDetector';
import { useLossRiskDetector } from '@/hooks/copilot/useLossRiskDetector';
import { AlertTriangle, Shield, Flame } from 'lucide-react';

export interface RadarPhase8PanelProps {
  lastClientMessage: string;
  draftText: string;
  messages: Array<{ content: string; sender: string }>;
  minutesSinceLastMessage?: number;
  onDraftText: (text: string) => void;
  className?: string;
}

export function RadarPhase8Panel({
  lastClientMessage,
  draftText,
  messages: _messages,
  minutesSinceLastMessage,
  onDraftText,
  className,
}: RadarPhase8PanelProps) {
  const [objectionDismissed, setObjectionDismissed] = useState(false);
  const [stallDismissed, setStallDismissed] = useState(false);

  const objection = useObjectionHandler({ clientText: lastClientMessage });
  const battleCard = useBattleCard({ clientText: lastClientMessage });
  const discountWarning = useDiscountGuardrail({ draftText });
  const stall = useStallDetector({ lastClientMessage, minutesSinceLastMessage });
  const lossRisk = useLossRiskDetector({ clientText: lastClientMessage });

  const hasContent =
    (!objectionDismissed && objection) ||
    battleCard?.detected ||
    discountWarning?.detected ||
    (!stallDismissed && stall) ||
    lossRisk.level === 'high';

  if (!hasContent) return null;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Desconto — alerta inline (sempre visível enquanto o draft tem desconto) */}
      {discountWarning?.detected && (
        <div className="flex items-start gap-2 rounded-lg border border-orange-500/50 bg-orange-50 dark:bg-orange-950/20 p-2.5 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-orange-500" />
          <div>
            <p className="font-medium text-orange-700 dark:text-orange-400">Atenção: desconto detectado</p>
            <p className="text-muted-foreground mt-0.5">{discountWarning.warningMessage}</p>
          </div>
        </div>
      )}

      {/* Risco de perda */}
      {lossRisk && lossRisk.level === 'high' && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/50 bg-red-50 dark:bg-red-950/20 p-2.5 text-xs">
          <Flame className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-500" />
          <div className="flex-1">
            <p className="font-medium text-red-700 dark:text-red-400">Risco de perda alto</p>
            <p className="text-muted-foreground mt-0.5">{lossRisk.recoveryAction}</p>
          </div>
        </div>
      )}

      {/* Battlecard */}
      {battleCard?.detected && (
        <div className="rounded-lg border border-purple-500/50 bg-purple-50 dark:bg-purple-950/20 p-2.5 text-xs">
          <div className="flex items-center gap-1.5 font-medium mb-1.5">
            <Shield className="w-3.5 h-3.5 text-purple-500" />
            <span>Concorrente mencionado</span>
          </div>
          <ul className="space-y-0.5">
            {battleCard.points.slice(0, 3).map((pt) => (
              <li key={pt.category} className="text-muted-foreground">
                ✓ {pt.advantage}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Objeção detectada */}
      {!objectionDismissed && objection && (
        <ObjectionCard
          objection={objection}
          onUseDraft={onDraftText}
          onDismiss={() => setObjectionDismissed(true)}
        />
      )}

      {/* Stall / estagnação */}
      {!stallDismissed && stall && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 p-2.5 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-yellow-500" />
          <div className="flex-1">
            <p className="font-medium text-yellow-700 dark:text-yellow-400">{stall.label}</p>
            <p className="text-muted-foreground mt-0.5">{stall.recoveryAction}</p>
            <div className="flex gap-3 mt-1">
              <button
                type="button"
                onClick={() => onDraftText(stall.draftLine)}
                className="text-3xs text-primary font-medium hover:underline"
              >
                Usar rascunho →
              </button>
              <button
                type="button"
                onClick={() => setStallDismissed(true)}
                className="text-3xs text-muted-foreground hover:underline"
              >
                Ignorar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
