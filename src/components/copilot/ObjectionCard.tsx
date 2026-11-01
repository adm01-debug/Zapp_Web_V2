/**
 * CV-072 — Cartão de objeção.
 *
 * Exibe a objeção detectada e a jogada de resposta sugerida.
 * "Usar" coloca o rascunho no input (CV-064) — nunca envia sozinho.
 */
import { ShieldAlert, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ObjectionResult } from '@/hooks/copilot/useObjectionHandler';

const OBJECTION_COLORS: Record<string, string> = {
  preco: 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/20',
  qualidade: 'border-blue-500/50 bg-blue-50 dark:bg-blue-950/20',
  prazo: 'border-red-500/50 bg-red-50 dark:bg-red-950/20',
  concorrente: 'border-purple-500/50 bg-purple-50 dark:bg-purple-950/20',
  chefe: 'border-slate-500/50 bg-slate-50 dark:bg-slate-950/20',
  quantidade_minima: 'border-green-500/50 bg-green-50 dark:bg-green-950/20',
  frete: 'border-cyan-500/50 bg-cyan-50 dark:bg-cyan-950/20',
  generica: 'border-border/50',
};

const OBJECTION_LABELS: Record<string, string> = {
  preco: 'Preço',
  qualidade: 'Qualidade',
  prazo: 'Prazo',
  concorrente: 'Concorrente',
  chefe: 'Decisor',
  quantidade_minima: 'Quantidade mínima',
  frete: 'Frete',
  generica: 'Objeção genérica',
};

export interface ObjectionCardProps {
  objection: ObjectionResult;
  onUseDraft: (text: string) => void;
  onDismiss?: () => void;
  className?: string;
}

export function ObjectionCard({ objection, onUseDraft, onDismiss, className }: ObjectionCardProps) {
  if (!objection.detected || !objection.type) return null;
  const colorClass = OBJECTION_COLORS[objection.type] ?? OBJECTION_COLORS.generica;

  return (
    <div className={cn('rounded-lg border p-3 text-xs', colorClass, className)}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 font-medium">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Objeção: {OBJECTION_LABELS[objection.type] ?? objection.type}</span>
          {objection.isSmokescreen && (
            <span className="text-3xs text-muted-foreground opacity-70">(cortina de fumaça)</span>
          )}
        </div>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="text-muted-foreground hover:text-foreground text-3xs">
            ✕
          </button>
        )}
      </div>

      {objection.treatmentSteps.length > 0 && (
        <div className="flex items-start gap-1.5 mb-2">
          <Lightbulb className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" />
          <p className="text-muted-foreground">{objection.treatmentSteps[0]}</p>
        </div>
      )}

      <div className="bg-background/60 rounded p-2 mb-2 italic text-foreground/80 leading-snug">
        "{objection.suggestedReply}"
      </div>

      <button
        type="button"
        onClick={() => onUseDraft(objection.suggestedReply)}
        className="text-3xs font-medium text-primary hover:underline"
      >
        Usar como rascunho →
      </button>
    </div>
  );
}
