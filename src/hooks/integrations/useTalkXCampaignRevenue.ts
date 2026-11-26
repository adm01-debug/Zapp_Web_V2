import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * X041 — Retorno da campanha (conversões, receita, investimento e ROI).
 *
 * O backend existe desde a X021/X041 (`talkx_campaign_revenue` e
 * `talkx_set_campaign_investment`), mas nenhuma tela lia a RPC: o relatório
 * mostrava envios/entregas e nunca "quanto a campanha vendeu". Aqui o número
 * vem do servidor (a RPC soma `talkx_conversions` pela RLS do chamador), nunca
 * de contagem feita no cliente.
 */

type TalkXRpc = (name: string, args: Record<string, unknown>) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

/** Contrato de resposta de `talkx_campaign_revenue` (jsonb). */
export type TalkXCampaignRevenuePayload = {
  campaign_id?: unknown;
  conversions?: unknown;
  revenue?: unknown;
  investment?: unknown;
  roi?: unknown;
  roi_percent?: unknown;
} | null;

export interface TalkXCampaignRevenueNumbers {
  /** Conversões atribuídas à campanha (negócio ganho). */
  conversions: number;
  /** Receita somada das conversões, em reais. */
  revenue: number;
  /** Investimento gravado; `null` quando nunca foi informado. */
  investment: number | null;
  /** ROI em %; `null` enquanto não há investimento > 0 (divisão indefinida). */
  roiPercent: number | null;
}

/**
 * `numeric` do Postgres chega como número no jsonb, mas o driver já devolveu
 * string em outros payloads (`"0.00"`); a tela não pode receber `NaN`.
 */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Traduz o jsonb do servidor para o contrato da tela. */
export function revenueFromServer(payload: TalkXCampaignRevenuePayload): TalkXCampaignRevenueNumbers {
  const conversions = Math.max(0, Math.floor(toNumber(payload?.conversions) ?? 0));
  const revenue = Math.max(0, toNumber(payload?.revenue) ?? 0);
  const investmentRaw = toNumber(payload?.investment);
  const investment = investmentRaw !== null && investmentRaw >= 0 ? investmentRaw : null;
  const roi = toNumber(payload?.roi_percent);
  // Sem investimento > 0 o ROI é indefinido — o servidor já devolve null, mas a
  // regra fica explícita para o caso de um replay antigo devolver 0.
  const roiPercent = investment !== null && investment > 0 ? roi : null;
  return { conversions, revenue, investment, roiPercent };
}

/**
 * Aceita o que o usuário digita: "1500", "1.500", "1.500,50", "1500,50",
 * "R$ 1.500,50". Devolve `null` quando não é um valor monetário válido.
 */
export function parseInvestmentInput(raw: string): number | null {
  const cleaned = raw.replace(/[R$\s]/g, '');
  if (!cleaned) return null;
  let normalized = cleaned;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // Formato pt-BR: ponto é milhar, vírgula é decimal.
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    normalized = cleaned.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    // "1.500" / "1.500.000": grupos de exatamente 3 dígitos depois do ponto são
    // milhar em pt-BR (sem vírgula o usuário não quis dizer um centavo e meio).
    normalized = cleaned.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Erros da RPC viram texto de tela (o servidor responde com código em inglês). */
export function describeInvestmentError(message: string | null | undefined): string {
  if (!message) return 'Não foi possível salvar o investimento.';
  if (message.includes('talkx_investment_not_authorized')) {
    return 'Apenas administradores e supervisores podem alterar o investimento.';
  }
  if (message.includes('talkx_investment_negative')) {
    return 'O investimento não pode ser negativo.';
  }
  if (message.includes('talkx_investment_campaign_not_found')) {
    return 'Campanha não encontrada — atualize a tela e tente de novo.';
  }
  return 'Não foi possível salvar o investimento.';
}

export interface TalkXCampaignRevenueResult extends TalkXCampaignRevenueNumbers {
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isSavingInvestment: boolean;
  investmentError: string | null;
  /** Grava o investimento; devolve `true` quando o servidor aceitou. */
  saveInvestment: (value: number) => Promise<boolean>;
}

export function useTalkXCampaignRevenue(
  campaignId: string | null | undefined,
): TalkXCampaignRevenueResult {
  const queryClient = useQueryClient();
  const enabled = !!campaignId;

  const query = useQuery({
    queryKey: ['talkx-campaign-revenue', campaignId],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const rpc = supabase.rpc.bind(supabase) as unknown as TalkXRpc;
      const { data, error } = await rpc('talkx_campaign_revenue', { p_campaign: campaignId });
      if (error) throw new Error(error.message);
      return revenueFromServer(data as TalkXCampaignRevenuePayload);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (value: number) => {
      const rpc = supabase.rpc.bind(supabase) as unknown as TalkXRpc;
      const { error } = await rpc('talkx_set_campaign_investment', {
        p_campaign_id: campaignId,
        p_investment: value,
      });
      if (error) throw new Error(error.message);
      return value;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['talkx-campaign-revenue', campaignId] });
    },
  });

  const numbers = query.data ?? { conversions: 0, revenue: 0, investment: null, roiPercent: null };

  return {
    ...numbers,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    refetch: () => { void query.refetch(); },
    isSavingInvestment: saveMutation.isPending,
    investmentError: describeInvestmentError(saveMutation.error instanceof Error ? saveMutation.error.message : null),
    saveInvestment: async (value: number) => {
      try {
        await saveMutation.mutateAsync(value);
        return true;
      } catch {
        return false;
      }
    },
  };
}
