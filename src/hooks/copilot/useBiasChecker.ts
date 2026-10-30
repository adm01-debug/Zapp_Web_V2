/**
 * CV-117 — Verificação de linguagem tendenciosa ou inadequada.
 *
 * Detecta padrões de linguagem que podem causar mal-entendidos, discriminação
 * ou quebra de confiança no contexto de vendas B2B: promessas irrealistas,
 * comparações depreciativas com concorrentes, linguagem excludente ou informal
 * excessiva.
 */
import { useMemo } from 'react';

export type BiasCategory =
  | 'unrealistic_promise'
  | 'competitor_derogation'
  | 'excessive_informality'
  | 'pressure_tactic'
  | 'exclusionary_language';

export interface BiasFlag {
  category: BiasCategory;
  excerpt: string;
  suggestion: string;
}

export interface BiasCheckerResult {
  flags: BiasFlag[];
  /** True se houver qualquer flag. */
  hasIssues: boolean;
  /** Score de risco 0–1. */
  riskScore: number;
}

type PatternEntry = {
  category: BiasCategory;
  patterns: RegExp[];
  suggestion: string;
};

const BIAS_PATTERNS: PatternEntry[] = [
  {
    category: 'unrealistic_promise',
    patterns: [
      /entrego\s+amanhã/i,
      /prazo\s+de\s+24\s*h/i,
      /garantido\s+para\s+hoje/i,
      /\b100%\s+certeza\b/i,
      /nunca\s+atrasa/i,
      /pronto\s+na\s+hora/i,
    ],
    suggestion: 'Evite promessas de prazo sem confirmar com a produção.',
  },
  {
    category: 'competitor_derogation',
    patterns: [
      /concorrente?\s+é\s+(ruim|péssim|terrível|lixo)/i,
      /eles\s+(enganam|roubam|mentem)/i,
      /evite\s+(a empresa|eles|esse fornecedor)/i,
    ],
    suggestion: 'Não denigra concorrentes — foque nos seus diferenciais.',
  },
  {
    category: 'pressure_tactic',
    patterns: [
      /última\s+unidade/i,
      /promoção\s+só\s+hoje/i,
      /se\s+não\s+fechar\s+agora/i,
      /oferta\s+expira\s+em\s+\d+\s*h/i,
      /estoque\s+acabando/i,
    ],
    suggestion: 'Urgência fabricada reduz a confiança — use apenas prazos reais.',
  },
  {
    category: 'excessive_informality',
    patterns: [
      /\bvocê\s+tá\s+louco\b/i,
      /mano[,\s]/i,
      /cara[,\s!]/i,
      /que barbada/i,
    ],
    suggestion: 'Mantenha linguagem profissional no canal comercial.',
  },
  {
    category: 'exclusionary_language',
    patterns: [
      /só\s+para\s+empresas\s+grandes/i,
      /clientes\s+pequenos\s+não/i,
      /mínimo\s+de\s+\d+\s*mil\s+peças/i,
    ],
    suggestion: 'Informe os mínimos mas não descarte clientes antes de entender o potencial.',
  },
];

export interface UseBiasCheckerOptions {
  text: string;
  enabled?: boolean;
}

export function useBiasChecker({ text, enabled = true }: UseBiasCheckerOptions): BiasCheckerResult {
  return useMemo(() => {
    if (!enabled || !text.trim()) return { flags: [], hasIssues: false, riskScore: 0 };

    const flags: BiasFlag[] = [];

    for (const { category, patterns, suggestion } of BIAS_PATTERNS) {
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          flags.push({ category, excerpt: match[0], suggestion });
          break; // uma flag por categoria
        }
      }
    }

    return {
      flags,
      hasIssues: flags.length > 0,
      riskScore: Math.min(flags.length * 0.25, 1),
    };
  }, [text, enabled]);
}
