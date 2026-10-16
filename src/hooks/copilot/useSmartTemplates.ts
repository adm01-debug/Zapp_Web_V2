/**
 * CV-068, CV-069 — Ranqueamento inteligente de templates e preenchimento de variáveis.
 *
 * CV-068: templates de resposta rápida são ranqueados por relevância para o estágio
 *   da venda e última mensagem do cliente.
 *
 * CV-069: variáveis conhecidas ({{nome}}, {{empresa}}, {{produto}}, {{prazo}},
 *   {{agente}}) são preenchidas automaticamente; desconhecidas ficam como [[chave]]
 *   (em laranja na UI) e aparecem em `pendingVars`.
 */
import { useMemo } from 'react';
import type { QuickReplyTemplate } from '@/hooks/chat/useQuickReplies';

export interface SaleContext {
  contactName?: string;
  contactCompany?: string;
  productMentioned?: string;
  deadlineMentioned?: string;
  agentName?: string;
  salesStage?: string;
  lastClientMessage?: string;
}

export interface RankedTemplate {
  template: QuickReplyTemplate;
  score: number;
  filledContent: string;
  pendingVars: string[];
}

/** Mapeamento estágio → palavras-chave que aumentam score do template. */
const STAGE_KEYWORDS: Record<string, string[]> = {
  prospecção: ['olá', 'bom dia', 'boa tarde', 'boa noite', 'saudação', 'apresentação', 'prazer'],
  qualificação: ['precisa', 'necessidade', 'objetivo', 'problema', 'desafio', 'orçamento'],
  proposta: ['proposta', 'orçamento', 'cotação', 'valor', 'preço', 'quanto', 'investimento'],
  negociação: ['desconto', 'condições', 'parcelamento', 'prazo', 'negociar', 'reduzir'],
  fechamento: ['fechar', 'confirmar', 'pedido', 'contrato', 'assinar', 'formalizar'],
  'pós-venda': ['entrega', 'satisfação', 'obrigado', 'feedback', 'suporte', 'acompanhamento'],
};

/** Palavras-chave do template title+content para cada estágio. */
const TEMPLATE_STAGE_HINTS: Record<string, string[]> = {
  prospecção: ['saudação', 'olá', 'apresento', 'prazer', 'boas-vindas'],
  qualificação: ['entender', 'necessidade', 'objetivo', 'perfil'],
  proposta: ['proposta', 'orçamento', 'cotação', 'valor', 'preço', 'investimento'],
  negociação: ['desconto', 'condição', 'negociar', 'flexível'],
  fechamento: ['confirmar', 'fechamento', 'pedido', 'contrato'],
  'pós-venda': ['entrega', 'satisfação', 'suporte', 'avaliação'],
};

function scoreTemplate(
  template: QuickReplyTemplate,
  context: SaleContext,
): number {
  let score = 0;
  const text = `${template.title} ${template.content}`.toLowerCase();
  const stage = (context.salesStage ?? '').toLowerCase();
  const lastMsg = (context.lastClientMessage ?? '').toLowerCase();

  // Pontuação por estágio
  if (stage && TEMPLATE_STAGE_HINTS[stage]) {
    for (const kw of TEMPLATE_STAGE_HINTS[stage]) {
      if (text.includes(kw)) score += 2;
    }
  }

  // Pontuação por palavras da última mensagem do cliente
  if (stage && STAGE_KEYWORDS[stage]) {
    for (const kw of STAGE_KEYWORDS[stage]) {
      if (lastMsg.includes(kw)) score += 1;
    }
  }

  // Bônus por uso histórico (normalizado)
  score += Math.min((template.use_count ?? 0) / 20, 1);

  return score;
}

/** Substitui variáveis conhecidas; marca desconhecidas como [[chave]]. */
function fillVariables(
  content: string,
  context: SaleContext,
): { filled: string; pending: string[] } {
  const known: Record<string, string | undefined> = {
    nome: context.contactName,
    empresa: context.contactCompany,
    produto: context.productMentioned,
    prazo: context.deadlineMentioned,
    agente: context.agentName,
  };

  const pending: string[] = [];
  const filled = content.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    const k = key.trim().toLowerCase();
    const val = known[k];
    if (val) return val;
    pending.push(k);
    return `[[${k}]]`;
  });

  return { filled, pending };
}

export interface UseSmartTemplatesOptions {
  templates: QuickReplyTemplate[];
  saleContext: SaleContext;
  topN?: number;
}

export function useSmartTemplates({
  templates,
  saleContext,
  topN = 5,
}: UseSmartTemplatesOptions): RankedTemplate[] {
  return useMemo(() => {
    if (!templates.length) return [];

    const ranked = templates
      .map((t) => {
        const score = scoreTemplate(t, saleContext);
        const { filled, pending } = fillVariables(t.content, saleContext);
        return {
          template: t,
          score,
          filledContent: filled,
          pendingVars: pending,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.template.use_count ?? 0) - (a.template.use_count ?? 0);
      })
      .slice(0, topN);

    return ranked;
  }, [templates, saleContext, topN]);
}
