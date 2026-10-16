import React from 'react';
import type { FollowUpDraft } from '@/hooks/copilot/useFollowUpDraft';
import type { FollowUpTiming } from '@/hooks/copilot/useFollowUpTiming';

export interface FollowUpCardProps {
  draft: FollowUpDraft;
  timing: FollowUpTiming;
  onUse: (text: string) => void;
  onSchedule?: () => void;
  className?: string;
}

const ELEMENT_LABELS: Record<FollowUpDraft['elementType'], string> = {
  mockup: '🎨 Mockup',
  deadline_alert: '⏰ Prazo',
  new_product: '🎁 Produto novo',
  social_proof: '⭐ Case',
  price_drop: '💰 Preço',
  custom: '✏️ Personalizado',
};

export function FollowUpCard({ draft, timing, onUse, onSchedule, className = '' }: FollowUpCardProps) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">Sugestão de follow-up</span>
        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
          {ELEMENT_LABELS[draft.elementType]}
        </span>
      </div>

      <p className="mb-2 rounded bg-gray-50 p-2 text-xs text-gray-700 leading-relaxed">
        {draft.text}
      </p>

      <div className="mb-2 rounded bg-blue-50 px-2 py-1 text-[10px] text-blue-700">
        <span className="font-medium">Melhor horário:</span> {timing.suggestedTime}
        {timing.isUrgent && <span className="ml-1 font-semibold text-orange-600">⚠️ urgente</span>}
        {' · '}{timing.rationale}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onUse(draft.text)}
          className="flex-1 rounded bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700"
        >
          Usar mensagem
        </button>
        {onSchedule && (
          <button
            onClick={onSchedule}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            Agendar
          </button>
        )}
      </div>
    </div>
  );
}
