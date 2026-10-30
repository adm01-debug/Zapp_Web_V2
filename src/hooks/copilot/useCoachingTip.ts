/**
 * CV-122 — Dica de coaching em tempo real (whisper mode).
 */
import { useMemo } from 'react';

export interface CoachingTip {
  tip: string;
  category: 'tone' | 'technique' | 'timing' | 'content';
  priority: 'low' | 'medium' | 'high';
}

const COACHING_RULES: Array<{ check: (text: string) => boolean; tip: CoachingTip }> = [
  { check: (t) => t.length > 300, tip: { tip: 'Mensagem muito longa. Quebre em partes menores para facilitar a leitura.', category: 'content', priority: 'medium' } },
  { check: (t) => /!{2,}/.test(t), tip: { tip: 'Múltiplos "!" podem soar agressivos. Use com moderação.', category: 'tone', priority: 'low' } },
  { check: (t) => /não posso|não consigo/i.test(t), tip: { tip: 'Reformule o "não posso" em positivo: "O que posso fazer é..."', category: 'technique', priority: 'high' } },
  { check: (t) => /problema/i.test(t), tip: { tip: 'Substitua "problema" por "situação" ou "ponto" — reduz percepção negativa.', category: 'tone', priority: 'low' } },
];

export function useCoachingTip({ draftText }: { draftText: string }): CoachingTip[] {
  return useMemo(() => {
    if (!draftText) return [];
    return COACHING_RULES.filter((r) => r.check(draftText)).map((r) => r.tip);
  }, [draftText]);
}
