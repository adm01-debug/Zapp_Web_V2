/**
 * RadarPhase8to15Panel — painel de integração RADAR fases 8-15 (CV-071 a CV-150).
 *
 * Orquestra todos os hooks de Fases 8-15 e exibe os cards/banners relevantes
 * no contexto da conversa ativa.
 */
import { useObjectionHandler } from '@/hooks/copilot/useObjectionHandler';
import { useDiscountGuardrail } from '@/hooks/copilot/useDiscountGuardrail';
import { useLossRiskDetector } from '@/hooks/copilot/useLossRiskDetector';
import { useDeadlineCalculator } from '@/hooks/copilot/useDeadlineCalculator';
import { useQuoteDraft } from '@/hooks/copilot/useQuoteDraft';
import { useUpsellSuggestion } from '@/hooks/copilot/useUpsellSuggestion';
import { useLeadThermometer } from '@/hooks/copilot/useLeadThermometer';
import { usePurchaseSignals } from '@/hooks/copilot/usePurchaseSignals';
import { useCoachingTip } from '@/hooks/copilot/useCoachingTip';
import { useGuardrails } from '@/hooks/copilot/useGuardrails';

import { ObjectionHandlerCard } from './ObjectionHandlerCard';
import { DiscountGuardrailBanner } from './DiscountGuardrailBanner';
import { DeadlineCalcCard } from './DeadlineCalcCard';
import { QuoteDraftCard } from './QuoteDraftCard';
import { UpsellCard } from './UpsellCard';
import { LeadThermometerBadge } from './LeadThermometerBadge';
import { PurchaseSignalAlert } from './PurchaseSignalAlert';
import { CoachingTipBanner } from './CoachingTipBanner';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RadarPhase8to15PanelProps {
  lastClientMessage: string;
  draftText: string;
  onInsertText: (text: string) => void;
  daysSinceLastContact?: number;
  eventDate?: Date;
  productType?: string;
  quoteDraftItems?: Array<{ description: string; quantity: number; unitPrice: number }>;
  clientName?: string;
  className?: string;
}

export function RadarPhase8to15Panel({
  lastClientMessage,
  draftText,
  onInsertText,
  daysSinceLastContact = 0,
  eventDate,
  productType = '',
  quoteDraftItems = [],
  clientName = '',
  className,
}: RadarPhase8to15PanelProps) {
  const [objectionDismissed, setObjectionDismissed] = useState(false);
  const [guardrailDismissed, setGuardrailDismissed] = useState(false);
  const [coachingDismissed, setCoachingDismissed] = useState(false);

  const objection = useObjectionHandler({ clientText: lastClientMessage });
  const discountGuard = useDiscountGuardrail({ draftText });
  const lossRisk = useLossRiskDetector({ clientText: lastClientMessage, daysSinceLastContact });
  const deadline = useDeadlineCalculator({
    eventDate: eventDate ?? null,
    productType,
    today: new Date(),
  });
  const quoteDraft = useQuoteDraft({
    clientName,
    items: quoteDraftItems,
    deliveryDays: deadline.productionDays,
    paymentTerms: '',
  });
  const upsell = useUpsellSuggestion({ productMentioned: productType || null });
  const thermometer = useLeadThermometer({
    messages: lastClientMessage ? [{ content: lastClientMessage, sender: 'contact' }] : [],
  });
  const purchaseSignals = usePurchaseSignals({ clientText: lastClientMessage });
  const coachingTips = useCoachingTip({ draftText });
  const guardrailViolations = useGuardrails({ draftText });

  const hasContent =
    (objection.detected && !objectionDismissed) ||
    (discountGuard.detected && !guardrailDismissed) ||
    lossRisk.level !== 'low' ||
    (eventDate !== undefined) ||
    quoteDraft.ready ||
    upsell.length > 0 ||
    purchaseSignals.length > 0 ||
    (coachingTips.length > 0 && !coachingDismissed) ||
    guardrailViolations.length > 0;

  if (!hasContent) return null;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Termômetro de lead */}
      {lastClientMessage && (
        <LeadThermometerBadge result={thermometer} />
      )}

      {/* Sinais de compra */}
      {purchaseSignals.length > 0 && (
        <PurchaseSignalAlert signals={purchaseSignals} />
      )}

      {/* Guardrail de desconto */}
      {discountGuard.detected && !guardrailDismissed && (
        <DiscountGuardrailBanner
          result={discountGuard}
          onSelectAlternative={onInsertText}
          onDismiss={() => setGuardrailDismissed(true)}
        />
      )}

      {/* Violações de guardrails */}
      {guardrailViolations.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-50/50 dark:bg-red-900/10 p-2.5">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <span className="text-xs font-medium text-red-700 dark:text-red-400">Guardrail</span>
          </div>
          {guardrailViolations.map((v, i) => (
            <p key={i} className="mt-0.5 text-xs text-muted-foreground">{v.message}</p>
          ))}
        </div>
      )}

      {/* Objeção detectada */}
      {objection.detected && !objectionDismissed && (
        <ObjectionHandlerCard
          result={objection}
          onUseSuggestion={onInsertText}
          onDismiss={() => setObjectionDismissed(true)}
        />
      )}

      {/* Risco de perda */}
      {lossRisk.level !== 'low' && (
        <div className={cn(
          'rounded-lg border p-2.5',
          lossRisk.level === 'high'
            ? 'border-red-500/30 bg-red-50/50 dark:bg-red-900/10'
            : 'border-amber-500/30 bg-amber-50/50 dark:bg-amber-900/10',
        )}>
          <p className="text-xs font-medium text-foreground/80">
            Risco de perda {lossRisk.level === 'high' ? 'alto' : 'médio'}
          </p>
          {lossRisk.recoveryAction && (
            <button
              type="button"
              className="mt-1 text-xs text-primary hover:underline"
              onClick={() => onInsertText(lossRisk.recoveryAction)}
            >
              Usar script de recuperação
            </button>
          )}
        </div>
      )}

      {/* Prazo de entrega */}
      {eventDate && (
        <DeadlineCalcCard
          result={deadline}
          onUseSuggestion={onInsertText}
        />
      )}

      {/* Rascunho de proposta */}
      {quoteDraft.ready && (
        <QuoteDraftCard
          draft={quoteDraft}
          onUseText={onInsertText}
        />
      )}

      {/* Upsell */}
      {upsell.length > 0 && (
        <UpsellCard
          suggestions={upsell}
          onUseSuggestion={onInsertText}
        />
      )}

      {/* Coaching tip */}
      {coachingTips.length > 0 && !coachingDismissed && (
        <CoachingTipBanner
          tips={coachingTips}
          onDismiss={() => setCoachingDismissed(true)}
        />
      )}
    </div>
  );
}
