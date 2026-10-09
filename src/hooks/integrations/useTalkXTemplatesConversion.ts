import { supabase } from '@/integrations/supabase/client';

/**
 * T04-039 / X092 — "Mais convertidos": ranking de templates por TAXA DE RESPOSTA.
 *
 * Fonte: a view `talkx_campaign_metrics` (uma linha por campanha CONCLUÍDA, com
 * `template_id`, `sent_count`, `replied_count` e `completed_at` — definida em
 * `supabase/migrations/20260916150000_talkx_e89_benchmarks.sql` e confirmada no type
 * gerado `src/integrations/supabase/types.ts`, `Views.talkx_campaign_metrics.Row`).
 *
 * A agregação por template acontece aqui porque a RPC de métricas por template
 * (etapa X086, ainda não existente no banco) não é chamável. A regra de negócio,
 * porém, é a mesma do plano: taxa de resposta = respostas ÷ envios, com a BASE
 * MÍNIMA A9 (um template só entra no ranking com ≥ `CONVERSION_MIN_SENT` envios).
 *
 * Honestidade do dado: quando a leitura bate no teto (`CONVERSION_ROW_LIMIT`) o
 * conjunto é uma AMOSTRA, não o total — e taxa por template sobre amostra não se
 * afirma. Nesse caso o ranking volta vazio com `truncated: true` (a tela mostra
 * "sem dados ainda", nunca um número inventado). Erro do Supabase também NÃO vira
 * "sem dados": ele é propagado (a tela de origem expõe `isError`).
 */
export const CONVERSION_WINDOW_DAYS = 90;
/** Base mínima A9 do ranking: envios exigidos para o template concorrer. */
export const CONVERSION_MIN_SENT = 50;
/** Teto defensivo de campanhas lidas. Bater exatamente aqui = conjunto truncado. */
export const CONVERSION_ROW_LIMIT = 500;
/**
 * Regra de sugestão (X092/T04-046, a mesma de `talkx_template_suggestions()`): só vale
 * propor variação A/B a um template com ≥ 200 envios — abaixo disso a taxa é ruído.
 */
export const SUGGESTION_MIN_SENT = 200;

export interface TalkXTemplateConversion {
  templateId: string;
  sent: number;
  replied: number;
  /** Taxa de resposta em pontos percentuais (0–100), arredondada a 1 casa. */
  replyRatePct: number;
}

export interface TalkXTemplateConversionRanking {
  items: TalkXTemplateConversion[];
  /** true quando ao menos um template atingiu a base mínima (A9). */
  hasBase: boolean;
  /** A leitura bateu no teto: o conjunto é amostra, não o total. */
  truncated: boolean;
}

export interface TalkXTemplateConversionState {
  ranking: TalkXTemplateConversionRanking | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

type ConversionRow = {
  template_id?: string | null;
  sent_count?: number | null;
  replied_count?: number | null;
};

/**
 * Agrega as linhas por template, aplica a base mínima e ordena por taxa de resposta.
 * Ordem DETERMINÍSTICA: taxa desc, empate pelo maior envio e, por fim, pelo id — sem o
 * desempate a lista trocava de ordem entre duas leituras iguais.
 */
export function buildConversionRanking(
  rows: ConversionRow[],
  opts: { minSent?: number } = {},
): TalkXTemplateConversionRanking {
  const minSent = opts.minSent ?? CONVERSION_MIN_SENT;
  const byTemplate = new Map<string, { sent: number; replied: number }>();
  for (const row of rows) {
    const id = row.template_id;
    if (!id) continue;
    const acc = byTemplate.get(id) ?? { sent: 0, replied: 0 };
    acc.sent += row.sent_count ?? 0;
    acc.replied += row.replied_count ?? 0;
    byTemplate.set(id, acc);
  }

  const items: TalkXTemplateConversion[] = [];
  byTemplate.forEach((acc, templateId) => {
    if (acc.sent < minSent) return;
    items.push({
      templateId,
      sent: acc.sent,
      replied: acc.replied,
      replyRatePct: Math.round((acc.replied / acc.sent) * 1000) / 10,
    });
  });
  items.sort(
    (a, b) =>
      b.replyRatePct - a.replyRatePct ||
      b.sent - a.sent ||
      a.templateId.localeCompare(b.templateId),
  );

  return { items, hasBase: items.length > 0, truncated: false };
}

/** Lê as campanhas concluídas da janela e devolve o ranking por taxa de resposta. */
export async function fetchConversionRanking(): Promise<TalkXTemplateConversionRanking> {
  const since = new Date(Date.now() - CONVERSION_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('talkx_campaign_metrics')
    .select('template_id, sent_count, replied_count')
    .gte('completed_at', since)
    .order('completed_at', { ascending: false })
    .limit(CONVERSION_ROW_LIMIT);
  if (error) throw error;

  const rows = (data ?? []) as ConversionRow[];
  if (rows.length >= CONVERSION_ROW_LIMIT) {
    // Amostra, não total: nada de afirmar taxa por template sobre ela.
    return { items: [], hasBase: false, truncated: true };
  }
  return buildConversionRanking(rows);
}
