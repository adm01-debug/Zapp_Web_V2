/**
 * CV-032 — Medidor B·R·I·N·D·E do painel RADAR.
 * 6 casinhas que acendem em cinza/amarelo/verde conforme o preenchimento.
 * Clique em uma casinha leva à mensagem de origem (se disponível).
 */
import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const BRINDE_META: Record<string, { label: string; description: string }> = {
  B: { label: 'B', description: 'Budget / Orçamento' },
  R: { label: 'R', description: 'Responsável / Decisor' },
  I: { label: 'I', description: 'Intenção de compra' },
  N: { label: 'N', description: 'Número / Quantidade' },
  D: { label: 'D', description: 'Data de necessidade' },
  E: { label: 'E', description: 'Entrega / Local' },
};

type BrindeLetter = 'B' | 'R' | 'I' | 'N' | 'D' | 'E';

interface BrindeMeterProps {
  state: Record<BrindeLetter, string | null>;
  evidence?: Record<BrindeLetter, string | null>;
  onLetterClick?: (letter: BrindeLetter, msgId: string | null) => void;
  /** Letras ausentes com sugestão de pergunta (highlight amarelo) */
  suggestedLetters?: BrindeLetter[];
}

export function BrindeMeter({ state, evidence, onLetterClick, suggestedLetters = [] }: BrindeMeterProps) {
  const letters = Object.keys(BRINDE_META) as BrindeLetter[];

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1" aria-label="Estado B·R·I·N·D·E">
        {letters.map((letter) => {
          const value = state[letter];
          const msgId = evidence?.[letter] ?? null;
          const isFilled = value !== null && value !== '';
          const isSuggested = !isFilled && suggestedLetters.includes(letter);

          return (
            <Tooltip key={letter}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onLetterClick?.(letter, msgId)}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded text-xs font-bold transition-colors',
                    isFilled
                      ? 'bg-green-500/20 text-green-600 dark:bg-green-400/20 dark:text-green-400 ring-1 ring-green-500/40'
                      : isSuggested
                        ? 'bg-yellow-400/20 text-yellow-600 dark:bg-yellow-400/20 dark:text-yellow-300 ring-1 ring-yellow-400/50 animate-pulse'
                        : 'bg-muted text-muted-foreground',
                    onLetterClick && 'cursor-pointer hover:brightness-110',
                  )}
                  aria-label={`${BRINDE_META[letter].description}: ${value ?? 'não preenchido'}`}
                >
                  {letter}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[200px]">
                <p className="font-semibold text-xs">{BRINDE_META[letter].description}</p>
                {value ? (
                  <p className="text-xs mt-0.5 text-muted-foreground line-clamp-2">{value}</p>
                ) : (
                  <p className="text-xs mt-0.5 text-muted-foreground">Não detectado ainda</p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
