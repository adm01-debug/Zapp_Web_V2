// CV-123–124: useCoachingHint hook
// After-the-fact coaching: when a vendor rejects copilot suggestions, surface patterns

import { useState } from 'react';

export type CoachingCategory = 'price_anchor' | 'objection_handling' | 'follow_up' | 'closing';

export interface CoachingHint {
  pattern: string;
  category: CoachingCategory;
  frequency: number;
  tip: string;
}

const PRICE_KEYWORDS = ['preço', 'preco', 'valor', 'desconto', 'custo', 'âncora', 'ancora', 'price', 'anchor'];
const OBJECTION_KEYWORDS = ['objeção', 'objecao', 'objeção', 'resistência', 'resistencia', 'não quer', 'nao quer', 'recusa'];
const FOLLOWUP_KEYWORDS = ['follow', 'acompanhamento', 'retorno', 'lembrete', 'prazo', 'aguardando'];
const CLOSING_KEYWORDS = ['fechar', 'fechamento', 'contrato', 'assinar', 'proposta', 'decisão', 'decisao'];

const TIPS: Record<CoachingCategory, string> = {
  price_anchor: 'Ancorar o preço antes de apresentar o valor final reduz a percepção de custo.',
  objection_handling: 'Responder objeções com perguntas abertas aumenta o engajamento do cliente.',
  follow_up: 'Manter acompanhamento ativo reduz em 30% a taxa de abandono de negociação.',
  closing: 'Técnicas de fechamento suaves (ex.: "Quando podemos começar?") funcionam melhor que diretas.',
};

function categorize(suggestion: string): CoachingCategory | null {
  const lower = suggestion.toLowerCase();
  if (PRICE_KEYWORDS.some((kw) => lower.includes(kw))) return 'price_anchor';
  if (OBJECTION_KEYWORDS.some((kw) => lower.includes(kw))) return 'objection_handling';
  if (FOLLOWUP_KEYWORDS.some((kw) => lower.includes(kw))) return 'follow_up';
  if (CLOSING_KEYWORDS.some((kw) => lower.includes(kw))) return 'closing';
  return null;
}

export interface UseCoachingHintResult {
  hints: CoachingHint[];
  dismissHint: (pattern: string) => void;
}

/**
 * CV-123–124
 * Surfaces coaching hints when a vendor repeatedly rejects a category of suggestion.
 * A hint is shown when the frequency for a category reaches >= 3 rejections.
 */
export function useCoachingHint(
  _vendorId: string,
  rejectedSuggestions: string[],
): UseCoachingHintResult {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Count rejections per category
  const counts: Record<CoachingCategory, number> = {
    price_anchor: 0,
    objection_handling: 0,
    follow_up: 0,
    closing: 0,
  };

  for (const suggestion of rejectedSuggestions) {
    const cat = categorize(suggestion);
    if (cat) counts[cat]++;
  }

  const hints: CoachingHint[] = (Object.entries(counts) as [CoachingCategory, number][])
    .filter(([cat, freq]) => freq >= 3 && !dismissed.has(cat))
    .map(([cat, freq]) => ({
      pattern: `Você recusou sugestões de ${categoryLabel(cat)} ${freq}x hoje`,
      category: cat,
      frequency: freq,
      tip: TIPS[cat],
    }));

  function dismissHint(pattern: string): void {
    // Find the category by pattern prefix and add to dismissed set
    const hint = hints.find((h) => h.pattern === pattern);
    if (hint) {
      setDismissed((prev) => new Set([...prev, hint.category]));
    }
  }

  return { hints, dismissHint };
}

function categoryLabel(cat: CoachingCategory): string {
  const labels: Record<CoachingCategory, string> = {
    price_anchor: 'âncora de preço',
    objection_handling: 'tratamento de objeção',
    follow_up: 'acompanhamento',
    closing: 'fechamento',
  };
  return labels[cat];
}
