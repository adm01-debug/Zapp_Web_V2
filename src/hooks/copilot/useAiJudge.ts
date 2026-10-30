/**
 * CV-132 — Juiz de IA (AI Judge).
 *
 * Avalia a qualidade da sugestão gerada pelo copilot antes de exibir ao vendedor.
 * Heurísticas locais; integração com LLM via edge function é DELEGADA.
 */
import { useMemo } from 'react';

export interface AiJudgeResult {
  score: number;
  passed: boolean;
  flags: string[];
}

export function useAiJudge({ suggestionText }: { suggestionText: string }): AiJudgeResult {
  return useMemo(() => {
    if (!suggestionText) return { score: 0, passed: false, flags: ['Sugestão vazia'] };
    const flags: string[] = [];

    if (suggestionText.length < 20) flags.push('Resposta muito curta');
    if (suggestionText.length > 500) flags.push('Resposta muito longa');
    if (/\bIA\b|\binteligência artificial\b/i.test(suggestionText)) flags.push('Não mencionar IA para o cliente');
    if (/garantimos|100%/i.test(suggestionText)) flags.push('Evitar garantias absolutas');

    const score = Math.max(0, 1 - flags.length * 0.2);
    return { score, passed: flags.length === 0, flags };
  }, [suggestionText]);
}
