import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// A função é introduzida pela migration da etapa X065. O types-sync gera a
// assinatura canônica só depois que o banco canônico receber a migration; não
// editar `types.ts` à mão, para não mascarar drift entre código e banco.
type PendingDatabaseRpc = (name: string, args: Record<string, unknown>) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

/**
 * X065 — estatística por variante do teste A/B da campanha.
 *
 * Contrato consumido (migration 20261118190000):
 *   talkx_campaign_variant_stats(p_campaign_id) → uma linha por variante do
 *   template da campanha, com CONTAGENS do servidor (a tela nunca divide pelo
 *   tamanho de um array) e as três taxas já calculadas em porcentagem.
 * SECURITY DEFINER com EXECUTE para `authenticated`; a própria RPC recusa quem
 * não é dono nem admin/supervisor da campanha.
 */
export interface TalkXAbVariantStat {
  variant_id: string;
  label: string | null;
  weight: number | null;
  total: number;
  sent: number;
  deliveries: number;
  reads: number;
  replies: number;
  clicks: number;
  reply_rate: number;
  click_rate: number;
  delivery_rate: number;
}

/** Métrica que decide a vencedora, espelhando a CHECK de `talkx_campaigns.ab_metric`. */
export type TalkXAbMetric = 'reply_rate' | 'click_rate' | 'delivery_rate';

export const TALKX_AB_METRIC_LABEL: Record<TalkXAbMetric, string> = {
  reply_rate: 'Taxa de resposta',
  click_rate: 'Taxa de clique',
  delivery_rate: 'Taxa de entrega',
};

/** A taxa da métrica escolhida, já em porcentagem, vinda do servidor. */
export function talkXAbRate(stat: TalkXAbVariantStat, metric: TalkXAbMetric): number {
  if (metric === 'click_rate') return Number(stat.click_rate ?? 0);
  if (metric === 'delivery_rate') return Number(stat.delivery_rate ?? 0);
  return Number(stat.reply_rate ?? 0);
}

/**
 * Lê a estatística por variante. Sem campanha, ou com o A/B desligado, a
 * consulta não roda — não existe resultado a mostrar e a chamada seria gasto
 * à toa.
 *
 * `emAndamento` liga a atualização periódica: entregas e respostas que chegam
 * durante o envio mudam as linhas que a RPC agrega, e sem isto o painel ficava
 * congelado na primeira leitura por toda a sessão (as outras consultas desta
 * mesma tela já têm intervalo próprio). Parada a campanha, o número não muda
 * mais e o intervalo sai — nada de consulta à toa.
 */
export function useTalkXAbStats(
  campaignId: string | null | undefined,
  enabled: boolean,
  emAndamento = false,
) {
  const query = useQuery({
    queryKey: ['talkx-ab-stats', campaignId],
    enabled: Boolean(campaignId) && enabled,
    refetchInterval: enabled && emAndamento ? 15_000 : false,
    queryFn: async () => {
      const rpc = supabase.rpc.bind(supabase) as unknown as PendingDatabaseRpc;
      const { data, error } = await rpc('talkx_campaign_variant_stats', { p_campaign_id: campaignId });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as TalkXAbVariantStat[];
    },
  });

  return {
    variants: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * X065 — grava a configuracao do teste A/B da campanha.
 *
 * Caminho proprio porque `save_talkx_campaign_draft` NAO conhece as colunas
 * `ab_*`: medido no banco ao vivo, ela extrai campo a campo e tem lista
 * explicita de colunas, entao mandar os tres no payload fazia a RPC descarta-los
 * em silencio — a tela dizia "salvo" e nada persistia.
 */
export async function gravarTalkXCampaignAb(input: {
  campaignId: string;
  expectedRevision: number;
  abEnabled: boolean;
  abMetric: TalkXAbMetric;
  abMinSample: number;
}): Promise<{ revision: number }> {
  const rpc = supabase.rpc.bind(supabase) as unknown as PendingDatabaseRpc;
  const { data, error } = await rpc('set_talkx_campaign_ab', {
    p_campaign_id: input.campaignId,
    p_expected_revision: input.expectedRevision,
    p_ab_enabled: input.abEnabled,
    p_ab_metric: input.abMetric,
    p_ab_min_sample: input.abMinSample,
  });
  if (error) throw error;
  const linha = (Array.isArray(data) ? data[0] : data) as { revision?: number } | null;
  return { revision: Number(linha?.revision ?? input.expectedRevision + 1) };
}

/**
 * X065 — resultado de `decide_talkx_ab_winner`.
 *
 * A RPC nunca lanca por falta de amostra: devolve `insufficient_data` com o
 * motivo, para a tela dizer POR QUE nao decidiu em vez de mostrar erro.
 *   - `min_sample`: alguma variante abaixo de `ab_min_sample`;
 *   - `less_than_two_variants`: sem par para comparar;
 *   - `difference_within_noise`: diferenca dentro de 2 erros-padrao.
 */
export type TalkXAbDecisao =
  | { status: 'decided'; mode: 'manual' | 'automatic'; winner_variant_id?: string }
  | { status: 'insufficient_data'; reason: string };

export const TALKX_AB_MOTIVO_LABEL: Record<string, string> = {
  min_sample: 'Ainda falta amostra em alguma variante.',
  less_than_two_variants: 'É preciso pelo menos duas variantes com dados.',
  difference_within_noise: 'A diferença entre as variantes ainda está dentro do ruído.',
};

/**
 * Decide a vencedora do teste A/B.
 *
 * Sem `variantId` a decisão é automática (o banco aplica a regra dos 2
 * erros-padrão); com `variantId` é manual, escolhida pelo operador.
 */
export function useDecidirTalkXAbWinner(campaignId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (variantId?: string | null): Promise<TalkXAbDecisao> => {
      if (!campaignId) throw new Error('campanha ausente');
      const rpc = supabase.rpc.bind(supabase) as unknown as PendingDatabaseRpc;
      const { data, error } = await rpc('decide_talkx_ab_winner', {
        p_campaign_id: campaignId,
        p_variant_id: variantId ?? null,
      });
      if (error) throw error;
      return data as TalkXAbDecisao;
    },
    onSuccess: (resultado) => {
      // Só recarrega quando houve decisão: `insufficient_data` não muda linha
      // nenhuma e a consulta extra seria gasto à toa.
      if (resultado?.status !== 'decided') return;
      queryClient.invalidateQueries({ queryKey: ['talkx-ab-stats', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
    },
  });
}
