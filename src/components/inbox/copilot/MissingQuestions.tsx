/**
 * CV-033 — "O que falta perguntar" — sugestões de pergunta para letras B·R·I·N·D·E vazias.
 * Nunca sugere pergunta sobre letra já confirmada.
 */
import React from 'react';
import { Button } from '@/components/ui/button';
import { HelpCircle } from 'lucide-react';
import {
  BRINDE_QUESTIONS,
  getMissingLetters,
  getBrindeQuestion,
  type BrindeLetter,
  type SaleStage,
} from '@/data/copilot/brinde-questions';
import { cn } from '@/lib/utils';

interface MissingQuestionsProps {
  brinde_state: Record<BrindeLetter, string | null>;
  stage: SaleStage;
  onSelectQuestion: (text: string) => void;
  className?: string;
}

export function MissingQuestions({ brinde_state, stage, onSelectQuestion, className }: MissingQuestionsProps) {
  const missing = getMissingLetters(brinde_state);
  if (missing.length === 0) return null;

  const questions = missing
    .map((letter) => getBrindeQuestion(letter, stage))
    .filter(Boolean) as typeof BRINDE_QUESTIONS;

  if (questions.length === 0) return null;

  // Mostra no máximo 2 sugestões para não poluir o painel
  const shown = questions.slice(0, 2);

  return (
    <div className={cn('space-y-1.5', className)}>
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <HelpCircle className="h-3.5 w-3.5" />
        O que falta perguntar
      </p>
      {shown.map((q) => (
        <button
          key={q.letter}
          type="button"
          onClick={() => onSelectQuestion(q.text)}
          className="w-full rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-left text-xs text-foreground hover:bg-muted transition-colors"
        >
          <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded bg-yellow-400/20 text-yellow-600 text-[10px] font-bold dark:text-yellow-300">
            {q.letter}
          </span>
          {q.text}
        </button>
      ))}
    </div>
  );
}
