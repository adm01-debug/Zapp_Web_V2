/**
 * CV-073: Shows competitor battlecard with strength points and comparison questions.
 */
import React from 'react';
import { X, CheckCircle2, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { BattlecardEntry } from '@/hooks/copilot/useBattlecard';

export interface BattlecardPanelProps {
  battlecard: BattlecardEntry | null;
  onDismiss: () => void;
  className?: string;
}

export function BattlecardPanel({ battlecard, onDismiss, className }: BattlecardPanelProps) {
  if (!battlecard) return null;

  return (
    <Card className={`border-l-4 border-l-blue-500 ${className ?? ''}`}>
      <CardHeader className="flex flex-row items-center justify-between py-2 px-3 pb-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Battlecard — Concorrência
        </span>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onDismiss}>
          <X className="h-3 w-3" />
          <span className="sr-only">Dispensar</span>
        </Button>
      </CardHeader>
      <CardContent className="px-3 py-2 space-y-3">
        {battlecard.strengthPoints.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              Nossos diferenciais
            </p>
            <ul className="space-y-1">
              {battlecard.strengthPoints.map((point, i) => (
                <li key={i} className="text-xs text-foreground flex items-start gap-1.5 leading-relaxed">
                  <CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {battlecard.comparisonQuestions.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <HelpCircle className="h-3 w-3 text-blue-500" />
              Perguntas de comparação
            </p>
            <ul className="space-y-1">
              {battlecard.comparisonQuestions.map((q, i) => (
                <li key={i} className="text-xs text-foreground flex items-start gap-1.5 leading-relaxed">
                  <span className="text-blue-500 shrink-0">›</span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
