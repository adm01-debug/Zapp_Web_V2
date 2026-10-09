import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SegmentRules } from '@/hooks/integrations/useTalkXSegments';

/**
 * X131 — Painel "Resumo da campanha" calculado no servidor.
 *
 * O rail do wizard mostrava números locais: "Público total" era o tamanho da
 * seleção manual (`selectedContacts.length`), "Bloqueados por supressão" só
 * existia depois de um save (o snapshot do rascunho) e, para segmento, era
 * sempre 0. Aqui o resumo passa a ser lido da MESMA RPC que decide o público
 * do disparo (`talkx_resolve_audience`, X016/X017): elegível, suprimido e
 * "público total" deixam de divergir do que o motor vai enviar.
 */

/** Contrato de resposta da RPC no modo `count` (X016). */
type TalkXAudienceCountPayload = {
  matched?: unknown;
  eligible?: unknown;
  suppressed?: unknown;
} | null;

type TalkXAudienceRpc = (name: string, args: Record<string, unknown>) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

export interface TalkXCampaignSummaryCounts {
  /**
   * Público total estimado: os contatos do recorte que o motor consegue
   * endereçar (elegíveis + bloqueados). Contato apagado/LID (legado) ou com
   * telefone inválido nunca faz parte do público — não entra no total.
   */
  total: number;
  /** Elegíveis para envio (não suprimidos, telefone válido, não apagados). */
  eligible: number;
  /** Bloqueados por supressão dentro do público. */
  suppressed: number;
}

export interface TalkXCampaignSummaryInput {
  /** Recorte por regras (mesmo formato do motor de segmentos). */
  rules?: SegmentRules | null;
  /** Segmentos salvos do recorte (o servidor resolve as regras deles). */
  segmentIds?: string[] | null;
  enabled?: boolean;
}

export interface TalkXCampaignSummary extends TalkXCampaignSummaryCounts {
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/** Converte contagem do jsonb do servidor em inteiro >= 0 (nunca NaN na tela). */
function toCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

/**
 * Traduz a resposta do servidor para o contrato da tela. `total` é
 * deliberadamente elegíveis + bloqueados: o mock da tela 08 fecha
 * (1.187 + 61 = 1.248) e a soma nunca depende de o servidor mandar `matched`.
 */
function summaryCountsFromServer(payload: TalkXAudienceCountPayload): TalkXCampaignSummaryCounts {
  const eligible = toCount(payload?.eligible);
  const suppressed = toCount(payload?.suppressed);
  return { total: eligible + suppressed, eligible, suppressed };
}

export function useTalkXCampaignSummary({
  rules = null,
  segmentIds = null,
  enabled = true,
}: TalkXCampaignSummaryInput = {}): TalkXCampaignSummary {
  // A chave é o conteúdo (as regras mudam a cada tecla digitada), não a
  // identidade do objeto: um novo `{ groups }` no mesmo recorte não refaz a
  // consulta.
  const rulesKey = JSON.stringify(rules ?? null);
  const segmentsKey = JSON.stringify(segmentIds ?? null);

  const query = useQuery({
    queryKey: ['talkx-campaign-summary', rulesKey, segmentsKey],
    enabled,
    staleTime: 15_000,
    queryFn: async () => {
      const rpc = supabase.rpc as unknown as TalkXAudienceRpc;
      const { data, error } = await rpc('talkx_resolve_audience', {
        p_rules: { groups: rules?.groups ?? [] },
        p_segment_ids: segmentIds && segmentIds.length > 0 ? segmentIds : null,
        p_mode: 'count',
        p_limit: null,
        p_after: null,
      });
      if (error) throw new Error(error.message);
      return summaryCountsFromServer(data as TalkXAudienceCountPayload);
    },
  });

  const counts = query.data ?? { total: 0, eligible: 0, suppressed: 0 };

  return {
    ...counts,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    refetch: () => { void query.refetch(); },
  };
}
