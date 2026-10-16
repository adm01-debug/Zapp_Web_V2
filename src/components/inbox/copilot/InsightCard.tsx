/**
 * CV-040 — Cartão de insight com justificativa (explicabilidade).
 * Todo cartão tem "por que estou sugerindo isso?" com evidência.
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Source {
  text: string;
  msg_id?: string;
  letter?: string;
}

interface InsightCardProps {
  type: 'suggestion' | 'alert' | 'next_action' | 'objection' | 'signal';
  content: string;
  sources: Source[];
  tier?: 1 | 2;
  onSelectContent?: (text: string) => void;
  onGoToMessage?: (msgId: string) => void;
}

const TYPE_META = {
  suggestion: { label: 'Sugestão', color: 'border-primary/30 bg-primary/5' },
  alert: { label: 'Alerta', color: 'border-orange-400/40 bg-orange-400/5' },
  next_action: { label: 'Próximo passo', color: 'border-indigo-400/40 bg-indigo-400/5' },
  objection: { label: 'Objeção detectada', color: 'border-red-400/40 bg-red-400/5' },
  signal: { label: 'Sinal', color: 'border-green-400/40 bg-green-400/5' },
};

export function InsightCard({ type, content, sources, tier, onSelectContent, onGoToMessage }: InsightCardProps) {
  const [showJustification, setShowJustification] = useState(false);
  const meta = TYPE_META[type] ?? TYPE_META.suggestion;
  const hasSources = sources.length > 0;

  return (
    <div className={cn('rounded-lg border p-3 text-sm', meta.color)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5 flex-1 min-w-0">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {meta.label}
              </span>
              {tier === 2 && (
                <span className="rounded bg-indigo-400/20 px-1 py-0.5 text-[9px] font-bold text-indigo-600 dark:text-indigo-300">
                  TIER-2
                </span>
              )}
            </div>
            <p className="text-xs leading-relaxed">{content}</p>
          </div>
        </div>
        {onSelectContent && (
          <button
            type="button"
            onClick={() => onSelectContent(content)}
            className="shrink-0 rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
          >
            Usar
          </button>
        )}
      </div>

      {/* CV-040: Justificativa obrigatória */}
      {hasSources && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowJustification((v) => !v)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showJustification ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Por que estou sugerindo isso?
          </button>
          {showJustification && (
            <div className="mt-1.5 space-y-1">
              {sources.map((s, i) => (
                <div key={i} className="flex items-start gap-1.5 rounded bg-muted/60 px-2 py-1.5 text-[10px]">
                  {s.letter && (
                    <span className="shrink-0 font-bold text-primary">{s.letter}</span>
                  )}
                  <span className="text-muted-foreground line-clamp-2">{s.text}</span>
                  {s.msg_id && onGoToMessage && (
                    <button
                      type="button"
                      onClick={() => onGoToMessage(s.msg_id!)}
                      className="ml-auto shrink-0 text-primary underline-offset-2 hover:underline"
                    >
                      ver
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CV-040: cartão sem fontes nunca deve existir — avisa no desenvolvimento */}
      {!hasSources && (
        <p className="mt-1.5 text-[10px] text-muted-foreground italic">
          (justificativa não disponível)
        </p>
      )}
    </div>
  );
}
