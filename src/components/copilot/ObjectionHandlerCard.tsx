/**
 * CV-072 — ObjectionHandlerCard
 *
 * Card exibido quando objeção é detectada. Mostra tipo, roteiro e sugestão de resposta.
 */
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { ObjectionResult } from '@/hooks/copilot/useObjectionHandler';

const OBJECTION_LABELS: Record<string, string> = {
  preco: 'Preço',
  prazo: 'Prazo',
  quantidade_minima: 'Qtd. mínima',
  concorrente: 'Concorrente',
  chefe: 'Aprovação interna',
  qualidade: 'Qualidade',
  frete: 'Frete',
  generica: 'Evasiva',
};

interface ObjectionHandlerCardProps {
  result: ObjectionResult;
  onUseSuggestion: (text: string) => void;
  onDismiss: () => void;
  className?: string;
}

export function ObjectionHandlerCard({ result, onUseSuggestion, onDismiss, className }: ObjectionHandlerCardProps) {
  const [expanded, setExpanded] = useState(false);
  if (!result.detected) return null;

  return (
    <div className={cn('rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-900/10 p-3', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Objeção: {result.type ? OBJECTION_LABELS[result.type] : 'Genérica'}
          </span>
          {result.isSmokescreen && (
            <span className="text-3xs bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 px-1 rounded">
              cortina
            </span>
          )}
        </div>
        <button type="button" onClick={onDismiss} className="text-muted-foreground hover:text-foreground text-xs">×</button>
      </div>

      <button
        type="button"
        className="mt-1.5 w-full text-left text-xs text-muted-foreground flex items-center gap-1"
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? 'Ocultar roteiro' : 'Ver roteiro'}
      </button>

      {expanded && (
        <ol className="mt-1.5 ml-3 space-y-0.5 list-decimal text-xs text-muted-foreground">
          {result.treatmentSteps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}

      {result.suggestedReply && (
        <div className="mt-2">
          <p className="text-xs text-foreground/80 italic">"{result.suggestedReply}"</p>
          <button
            type="button"
            className="mt-1 text-xs text-primary hover:underline"
            onClick={() => onUseSuggestion(result.suggestedReply)}
          >
            Usar sugestão
          </button>
        </div>
      )}
    </div>
  );
}
