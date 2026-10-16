/**
 * CV-066 — CopilotFeedback
 *
 * Componente de feedback de 1 clique para sugestões do RADAR.
 * Polegar para cima (positivo) ou para baixo (negativo) + motivo rápido.
 *
 * Motivos rápidos disponíveis (somente no thumbs down):
 *   - "errou fato"   — a sugestão continha dado errado
 *   - "tom errado"   — o tom não foi adequado
 *   - "fora de hora" — não era o momento certo
 *   - "genérica"     — muito genérica, sem contexto
 */
import { useState } from 'react';
import { ThumbsUp, ThumbsDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FeedbackRating, FeedbackReason } from '@/hooks/copilot/useCopilotFeedback';

const NEGATIVE_REASONS: Array<{ key: FeedbackReason; label: string }> = [
  { key: 'errou_fato', label: 'Errou fato' },
  { key: 'tom_errado', label: 'Tom errado' },
  { key: 'fora_de_hora', label: 'Fora de hora' },
  { key: 'generica', label: 'Genérica' },
];

export interface CopilotFeedbackProps {
  /** Identificador da sugestão que está sendo avaliada. */
  suggestionId: string;
  /** Callback com o rating e motivo (motivo só em 'negative'). */
  onFeedback: (rating: FeedbackRating, reason?: FeedbackReason) => void;
  className?: string;
}

export function CopilotFeedback({
  suggestionId,
  onFeedback,
  className,
}: CopilotFeedbackProps) {
  const [submitted, setSubmitted] = useState(false);
  const [showReasons, setShowReasons] = useState(false);

  const handlePositive = () => {
    onFeedback('positive');
    setSubmitted(true);
  };

  const handleNegative = () => {
    setShowReasons(true);
  };

  const handleReason = (reason: FeedbackReason) => {
    onFeedback('negative', reason);
    setSubmitted(true);
    setShowReasons(false);
  };

  const handleDismissReasons = () => {
    setShowReasons(false);
  };

  if (submitted) {
    return (
      <span className={cn('text-3xs text-muted-foreground/60 select-none', className)}>
        Obrigado pelo feedback!
      </span>
    );
  }

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {showReasons ? (
        <>
          {NEGATIVE_REASONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleReason(key)}
              className="rounded-full border border-border/60 px-2 py-0.5 text-3xs text-muted-foreground hover:border-destructive/50 hover:text-destructive transition-colors"
              aria-label={`Motivo: ${label}`}
            >
              {label}
            </button>
          ))}
          <Button
            variant="ghost"
            size="icon"
            className="w-5 h-5 rounded-full"
            onClick={handleDismissReasons}
            aria-label="Cancelar feedback"
          >
            <X className="w-3 h-3" />
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 rounded-full text-muted-foreground hover:text-success hover:bg-success/10"
            onClick={handlePositive}
            aria-label="Sugestão boa"
            data-testid={`copilot-feedback-positive-${suggestionId}`}
          >
            <ThumbsUp className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={handleNegative}
            aria-label="Sugestão ruim"
            data-testid={`copilot-feedback-negative-${suggestionId}`}
          >
            <ThumbsDown className="w-3.5 h-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}
