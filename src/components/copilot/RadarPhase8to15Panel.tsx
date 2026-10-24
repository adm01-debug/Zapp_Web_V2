/**
 * RadarPhase8to15Panel — Aggregated panel for RADAR Copilot Phases 8–15 (CV-071 to CV-150).
 * Renders whichever cards have active content; all others are hidden.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { ObjectionCard } from './ObjectionCard';
import { DeadlineCard } from './DeadlineCard';
import { LeadThermometer } from './LeadThermometer';
import { BuyingSignalsCard } from './BuyingSignalsCard';
import type { ObjectionHandlerState } from '@/hooks/copilot/useObjectionHandler';
import type { DeadlineCalculatorState } from '@/hooks/copilot/useDeadlineCalculator';
import type { LeadTemperatureState } from '@/hooks/copilot/useLeadTemperature';
import type { LossRiskState } from '@/hooks/copilot/useLossRisk';
import type { PriceAnchorState } from '@/hooks/copilot/usePriceAnchor';

export interface RadarPhase8to15PanelProps {
  objection: ObjectionHandlerState;
  onDismissObjection: () => void;
  deadline: DeadlineCalculatorState;
  onDismissDeadline: () => void;
  temperature: LeadTemperatureState;
  lossRisk: LossRiskState;
  onDismissLossRisk: () => void;
  priceAnchor: PriceAnchorState;
  className?: string;
}

export function RadarPhase8to15Panel({
  objection,
  onDismissObjection,
  deadline,
  onDismissDeadline,
  temperature,
  lossRisk,
  onDismissLossRisk,
  priceAnchor,
  className,
}: RadarPhase8to15PanelProps) {
  const hasObjection = !!objection.objectionType;
  const hasDeadline = !!deadline.deadline || deadline.impossibleDeadline;
  const hasTemperature = temperature.score > 0;
  const hasLossRisk = lossRisk.triggered;
  const hasGuardrail = priceAnchor.guardrailTriggered;

  if (!hasObjection && !hasDeadline && !hasTemperature && !hasLossRisk && !hasGuardrail) {
    return null;
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {hasTemperature && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs text-muted-foreground">Temperatura:</span>
          <LeadThermometer score={temperature.score} label={temperature.label} />
        </div>
      )}

      {(temperature.signals.length > 0 ||
        temperature.whatsapp24hWarning ||
        temperature.silenceAlertMinutes !== null) && (
        <BuyingSignalsCard
          signals={temperature.signals}
          whatsapp24hWarning={temperature.whatsapp24hWarning}
          silenceAlertMinutes={temperature.silenceAlertMinutes}
        />
      )}

      {hasGuardrail && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
          🚫 Desconto proposto ({priceAnchor.proposedDiscountPct}%) excede o máximo autorizado
          ({priceAnchor.maxDiscountPct}%). {priceAnchor.valueFraming}
        </div>
      )}

      {hasLossRisk && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm dark:border-red-700 dark:bg-red-950">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium text-red-700 dark:text-red-300">
              ⚠️ Venda em risco ({lossRisk.riskScore}/100)
            </span>
            <button
              onClick={onDismissLossRisk}
              aria-label="Fechar"
              className="text-red-400 hover:text-red-600"
            >
              ×
            </button>
          </div>
          {lossRisk.recoveryAction && (
            <p className="text-red-800 dark:text-red-200">{lossRisk.recoveryAction}</p>
          )}
        </div>
      )}

      {hasObjection && (
        <ObjectionCard
          objectionType={objection.objectionType!}
          treatmentScript={objection.treatmentScript}
          battlecard={objection.battlecard}
          tradeInOffer={objection.tradeInOffer}
          smallerLotSuggestion={objection.smallerLotSuggestion}
          postNoRecovery={objection.postNoRecovery}
          onDismiss={onDismissObjection}
        />
      )}

      {hasDeadline && deadline.deadline && (
        <DeadlineCard
          deadline={deadline.deadline}
          freightEstimate={deadline.freightEstimate}
          impossibleDeadline={deadline.impossibleDeadline}
          impossibleReason={deadline.impossibleReason}
          onDismiss={onDismissDeadline}
        />
      )}
    </div>
  );
}
