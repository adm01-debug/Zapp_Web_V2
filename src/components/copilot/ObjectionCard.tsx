import React from 'react';
import { cn } from '@/lib/utils';
import type { ObjectionType, Battlecard } from '@/hooks/copilot/useObjectionHandler';

export interface ObjectionCardProps {
  objectionType: ObjectionType;
  treatmentScript: string;
  battlecard?: Battlecard | null;
  tradeInOffer?: string;
  smallerLotSuggestion?: string;
  postNoRecovery?: string;
  onDismiss?: () => void;
  className?: string;
}

const OBJECTION_LABELS: Record<ObjectionType, string> = {
  price: 'Preço',
  competitor: 'Concorrente',
  delay: 'Prazo',
  min_quantity: 'Quantidade mínima',
  hard_no: 'Recusa firme',
  trade_in: 'Troca / usado',
  other: 'Outra objeção',
};

export function ObjectionCard({
  objectionType,
  treatmentScript,
  battlecard,
  tradeInOffer,
  smallerLotSuggestion,
  postNoRecovery,
  onDismiss,
  className,
}: ObjectionCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950',
        className,
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-amber-800 dark:text-amber-300">
          Objeção: {OBJECTION_LABELS[objectionType]}
        </span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Fechar"
            className="text-amber-500 hover:text-amber-700 dark:text-amber-400"
          >
            ×
          </button>
        )}
      </div>

      {treatmentScript && (
        <p className="mb-2 text-amber-900 dark:text-amber-100">{treatmentScript}</p>
      )}

      {battlecard && (
        <div className="mt-2 rounded border border-amber-300 bg-amber-100 p-2 dark:border-amber-700 dark:bg-amber-900">
          <p className="mb-1 font-medium text-amber-800 dark:text-amber-200">
            Battlecard: {battlecard.competitorName}
          </p>
          {battlecard.talkingPoints.length > 0 && (
            <ul className="ml-4 list-disc text-amber-800 dark:text-amber-200">
              {battlecard.talkingPoints.map((pt, i) => (
                <li key={i}>{pt}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tradeInOffer && (
        <p className="mt-1 text-amber-700 dark:text-amber-300">
          <span className="font-medium">Trade-in:</span> {tradeInOffer}
        </p>
      )}
      {smallerLotSuggestion && (
        <p className="mt-1 text-amber-700 dark:text-amber-300">
          <span className="font-medium">Lote menor:</span> {smallerLotSuggestion}
        </p>
      )}
      {postNoRecovery && (
        <p className="mt-1 text-amber-700 dark:text-amber-300">
          <span className="font-medium">Recuperação:</span> {postNoRecovery}
        </p>
      )}
    </div>
  );
}
