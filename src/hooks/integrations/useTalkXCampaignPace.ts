import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * X018 — orçamento de envio da campanha (mensagens por minuto e por dia).
 *
 * `public.talkx_campaign_pace` existe desde a X018 e devolve o orçamento da
 * conexão da campanha, mas nenhuma tela lia a RPC: o operador não sabia que a
 * conexão tinha teto (6/min e 500/dia por padrão) e via a campanha "parada"
 * sem motivo. Aqui o número vem do servidor, nunca de contagem no cliente.
 *
 * A RPC exige admin/supervisor (`talkx_campaign_role_required`) ou service_role;
 * o caminho de admin ficou quebrado em produção até 2026-11-26 porque a função
 * repassava para `talkx_connection_send_budget`, que exige service_role
 * (`auth.role()` lê o JWT da requisição, não o dono do SECURITY DEFINER).
 */

type TalkXRpc = (name: string, args: Record<string, unknown>) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

/** Contrato de resposta de `talkx_campaign_pace` (jsonb). */
export type TalkXCampaignPacePayload = {
  minute_limit?: unknown;
  minute_sent?: unknown;
  minute_remaining?: unknown;
  day_limit?: unknown;
  day_sent?: unknown;
  day_remaining?: unknown;
  next_day_at?: unknown;
} | null;

export interface TalkXCampaignPaceNumbers {
  /** Teto de mensagens por minuto da conexão. */
  minuteLimit: number;
  /** Enviadas nos últimos 60 segundos (TalkX + Multiplix na mesma conexão). */
  minuteSent: number;
  minuteRemaining: number;
  /** Teto de mensagens por dia (fuso America/Sao_Paulo). */
  dayLimit: number;
  daySent: number;
  dayRemaining: number;
  /** Instante ISO em que a cota do dia vira; `null` sem conexão vinculada. */
  nextDayAt: string | null;
}

const ZERO: TalkXCampaignPaceNumbers = {
  minuteLimit: 0,
  minuteSent: 0,
  minuteRemaining: 0,
  dayLimit: 0,
  daySent: 0,
  dayRemaining: 0,
  nextDayAt: null,
};

function toCount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.floor(value) : null;
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

function toIsoString(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Traduz o jsonb do servidor para o contrato da tela. O saldo é recalculado
 * quando o servidor não manda `*_remaining` (replay antigo), e nada pode sair
 * negativo: o teto é do servidor, a tela só desenha.
 */
export function paceFromServer(payload: TalkXCampaignPacePayload): TalkXCampaignPaceNumbers {
  if (!payload) return ZERO;
  const minuteLimit = Math.max(0, toCount(payload.minute_limit) ?? 0);
  const minuteSent = Math.max(0, toCount(payload.minute_sent) ?? 0);
  const dayLimit = Math.max(0, toCount(payload.day_limit) ?? 0);
  const daySent = Math.max(0, toCount(payload.day_sent) ?? 0);
  const minuteRemaining = Math.max(
    0,
    toCount(payload.minute_remaining) ?? Math.max(minuteLimit - minuteSent, 0),
  );
  const dayRemaining = Math.max(
    0,
    toCount(payload.day_remaining) ?? Math.max(dayLimit - daySent, 0),
  );
  return {
    minuteLimit,
    minuteSent,
    minuteRemaining,
    dayLimit,
    daySent,
    dayRemaining,
    nextDayAt: toIsoString(payload.next_day_at),
  };
}

/** Campanha sem conexão de WhatsApp: o servidor devolve tudo zerado. */
export function isEmptyPace(pace: TalkXCampaignPaceNumbers): boolean {
  return pace.dayLimit === 0 && pace.minuteLimit === 0;
}

/** `true` quando o erro é falta de permissão (42501), não falha de leitura. */
export function isPaceForbidden(message: string | null | undefined): boolean {
  return !!message && message.includes('talkx_campaign_role_required');
}

/** Erros da RPC viram texto de tela (o servidor responde com código em inglês). */
export function describePaceError(message: string | null | undefined): string {
  if (!message) return 'Não foi possível carregar o orçamento de envio.';
  if (isPaceForbidden(message)) {
    return 'Apenas administradores e supervisores veem o orçamento de envio.';
  }
  if (message.includes('service_role_required')) {
    return 'O servidor ainda exige service_role para ler o orçamento desta campanha.';
  }
  if (message.includes('talkx_campaign_not_found')) {
    return 'Campanha não encontrada — atualize a tela e tente de novo.';
  }
  return 'Não foi possível carregar o orçamento de envio.';
}

/** Quanto do teto já foi usado, em % (0..100). Teto zero devolve 0. */
export function paceUsagePercent(sent: number, limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  const used = (Math.max(0, sent) / limit) * 100;
  return Math.min(100, Math.round(used));
}

/**
 * Texto do "renova em": o servidor manda o instante do próximo dia no fuso de
 * São Paulo; a tela mostra quanto falta, não o horário UTC cru.
 */
export function describeNextReset(nextDayAt: string | null, now: Date = new Date()): string {
  if (!nextDayAt) return 'Sem conexão vinculada';
  const target = new Date(nextDayAt);
  if (Number.isNaN(target.getTime())) return 'Sem conexão vinculada';
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return 'Renova a qualquer momento';
  const totalMinutes = Math.ceil(diffMs / 60_000);
  if (totalMinutes < 60) return `Renova em ${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `Renova em ${hours} h` : `Renova em ${hours} h ${minutes} min`;
}

export interface TalkXCampaignPaceResult extends TalkXCampaignPaceNumbers {
  isLoading: boolean;
  isError: boolean;
  /** Falta de permissão (42501) — a tela mostra "restrito", não "erro". */
  isForbidden: boolean;
  error: Error | null;
  /** Texto de erro já traduzido para a tela. */
  errorMessage: string | null;
  refetch: () => void;
}

export function useTalkXCampaignPace(
  campaignId: string | null | undefined,
): TalkXCampaignPaceResult {
  const enabled = !!campaignId;

  const query = useQuery({
    queryKey: ['talkx-campaign-pace', campaignId],
    enabled,
    // O orçamento anda junto com o motor: 60 s cobre o turno de uma campanha
    // ativa sem martelar a RPC.
    staleTime: 15_000,
    refetchInterval: enabled ? 60_000 : false,
    queryFn: async () => {
      const rpc = supabase.rpc.bind(supabase) as unknown as TalkXRpc;
      const { data, error } = await rpc('talkx_campaign_pace', { p_campaign_id: campaignId });
      if (error) throw new Error(error.message);
      return paceFromServer(data as TalkXCampaignPacePayload);
    },
  });

  const message = query.error instanceof Error ? query.error.message : null;

  return {
    ...(query.data ?? ZERO),
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    isForbidden: isPaceForbidden(message),
    error: (query.error as Error | null) ?? null,
    errorMessage: query.isError ? describePaceError(message) : null,
    refetch: () => { void query.refetch(); },
  };
}