// CV-113–114: Tone Guard hook
// Detects inappropriate tone in AI suggestions before showing to vendor

export type ToneIssueType =
  | 'too_formal'
  | 'too_casual'
  | 'negative_framing'
  | 'pressure_sales'
  | 'false_urgency';

export type ToneIssueSeverity = 'low' | 'medium' | 'high';

export interface ToneIssue {
  type: ToneIssueType;
  severity: ToneIssueSeverity;
  suggestion: string;
}

export interface ToneGuardResult {
  hasIssues: boolean;
  issues: ToneIssue[];
  improvedSuggestion: string | null;
}

const FALSE_URGENCY_KEYWORDS = ['última chance', 'só hoje', 'acabando', 'esgotando'];
const PRESSURE_SALES_KEYWORDS = ['precisa decidir agora', 'não posso garantir', 'vai perder'];
const NEGATIVE_FRAMING_STARTS = ['não', 'infelizmente', 'impossível'];
const TOO_CASUAL_PATTERNS = ['kkk', 'rsrs'];

function countEmojis(text: string): number {
  const emojiRegex =
    /[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F000}-\u{1FFFF}]/gu;
  return (text.match(emojiRegex) || []).length;
}

function reframeNegative(text: string): string {
  // Simple positive reframing: strip leading negative word and restructure
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('não ')) {
    return 'Podemos encontrar uma alternativa: ' + trimmed.slice(4);
  }
  if (lower.startsWith('infelizmente')) {
    return trimmed.replace(/^infelizmente[,\s]*/i, 'Vamos resolver isso: ');
  }
  if (lower.startsWith('impossível')) {
    return trimmed.replace(/^impossível[,\s]*/i, 'Ainda não conseguimos, mas podemos ');
  }
  return trimmed;
}

export function useToneGuard() {
  const checkTone = (text: string): ToneGuardResult => {
    const issues: ToneIssue[] = [];
    let improvedSuggestion: string | null = null;
    const lowerText = text.toLowerCase();

    // false_urgency
    for (const kw of FALSE_URGENCY_KEYWORDS) {
      if (lowerText.includes(kw)) {
        issues.push({
          type: 'false_urgency',
          severity: 'high',
          suggestion: 'Evite urgência falsa — use prazos reais',
        });
        break;
      }
    }

    // pressure_sales
    for (const kw of PRESSURE_SALES_KEYWORDS) {
      if (lowerText.includes(kw)) {
        issues.push({
          type: 'pressure_sales',
          severity: 'high',
          suggestion: 'Evite pressão de vendas — apresente valor genuíno',
        });
        break;
      }
    }

    // negative_framing
    const firstWord = lowerText.trimStart().split(/[\s,!.]/)[0];
    if (NEGATIVE_FRAMING_STARTS.includes(firstWord)) {
      const improved = reframeNegative(text);
      issues.push({
        type: 'negative_framing',
        severity: 'medium',
        suggestion: 'Reformule de forma positiva',
      });
      improvedSuggestion = improved;
    }

    // too_casual: excessive emojis or slang
    const emojiCount = countEmojis(text);
    const hasCasualSlang = TOO_CASUAL_PATTERNS.some((p) => lowerText.includes(p));
    if (emojiCount > 3 || hasCasualSlang) {
      issues.push({
        type: 'too_casual',
        severity: 'low',
        suggestion: 'Mantenha um tom profissional com o cliente',
      });
    }

    return {
      hasIssues: issues.length > 0,
      issues,
      improvedSuggestion,
    };
  };

  return { checkTone };
}
