/**
 * X154 (TL-161) — regras de leitura/escrita da campanha usadas pelo card de ações e
 * pelo modal de limites da tela 12 (Em Andamento).
 *
 * Fica fora dos arquivos `.tsx` de propósito: eles exportam só componentes (a regra de
 * fast refresh do projeto reprova constante/função exportada junto de componente).
 *
 * A9 (base mínima): cada linha da tela só existe quando a campanha traz o dado. As
 * colunas de dias de envio (`send_days`) e de não perturbe (`respect_dnd`) ainda não
 * existem em `talkx_campaigns` — quando a trilha de banco criar as colunas, o mesmo
 * payload (`select('*')` de `useTalkX`) passa a trazer os campos e as linhas aparecem.
 */
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { msToSeconds, secondsToMs, intervalForProfile, isValidIntervalSeconds } from '../talkxLimits';

/**
 * Campos que `talkx_campaigns` ainda vai ganhar pela trilha de banco.
 * `max_per_minute` já existe na tabela; dias e DND, não.
 */
export interface TalkXCampaignWithRules extends TalkXCampaign {
  max_per_minute?: number | null;
  send_days?: string[] | null;
  respect_dnd?: boolean | null;
}

const WEEKDAY_LABEL: Record<string, string> = {
  mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom',
};
const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Dias de envio → rótulo curto. Sem dias informados não há linha (A9). */
export function formatSendDays(days: string[] | null | undefined): string | null {
  const known = (days ?? []).filter((day) => WEEKDAY_LABEL[day]);
  if (known.length === 0) return null;
  if (known.length === WEEK_ORDER.length) return 'Todos os dias';
  if (WEEK_ORDER.slice(0, 5).every((day) => known.includes(day))) return 'Dias úteis (seg a sex)';
  return WEEK_ORDER.filter((day) => known.includes(day)).map((day) => WEEKDAY_LABEL[day]).join(', ');
}

/** Janela de envio (`time` do Postgres, "08:00:00") → "08:00 - 18:00". */
export function formatSendWindow(start?: string | null, end?: string | null): string | null {
  if (!start || !end) return null;
  return `${start.slice(0, 5)} - ${end.slice(0, 5)}`;
}

/** Rascunho do formulário de limites: intervalos em SEGUNDOS, como o operador digita. */
export interface TalkXLimitsDraft {
  speedProfile: string;
  intervalMin: number;
  intervalMax: number;
  windowStart: string;
  windowEnd: string;
  businessHoursOnly: boolean;
}

/**
 * Payload da RPC de limites: intervalos em MILISSEGUNDOS.
 *
 * É `type` (e não `interface`) de propósito: o modal entrega este objeto ao
 * `updateCampaignLimits`, cujo parâmetro é `Record<string, unknown>` — interface não
 * tem assinatura de índice implícita e a atribuição falharia no typecheck.
 */
export type TalkXLimitsPayload = {
  speed_profile: string;
  send_interval_min: number;
  send_interval_max: number;
  send_window_start: string | null;
  send_window_end: string | null;
  business_hours_only: boolean;
};

export const EMPTY_LIMITS_DRAFT: TalkXLimitsDraft = {
  speedProfile: 'moderate', intervalMin: 0, intervalMax: 0,
  windowStart: '', windowEnd: '', businessHoursOnly: false,
};

/** Campanha (banco) → rascunho do formulário (segundos, "HH:mm"). */
export function limitsDraftFromCampaign(campaign: TalkXCampaign): TalkXLimitsDraft {
  return {
    speedProfile: campaign.speed_profile ?? 'moderate',
    intervalMin: msToSeconds(campaign.send_interval_min),
    intervalMax: msToSeconds(campaign.send_interval_max),
    windowStart: campaign.send_window_start?.slice(0, 5) ?? '',
    windowEnd: campaign.send_window_end?.slice(0, 5) ?? '',
    businessHoursOnly: campaign.business_hours_only ?? false,
  };
}

/**
 * Rascunho (segundos) → payload aceito pela RPC `update_talkx_campaign_limits`
 * (supabase/migrations/20260930180000_talkx_update_campaign_limits_rpc.sql): só as
 * chaves da lista branca dela. Qualquer outra faz o servidor responder
 * `invalid_talkx_limits_field`. Limite por minuto, dias da semana e DND entram aqui
 * quando a trilha de banco criar as colunas e a RPC aceitar as chaves.
 */
export function limitsPayload(draft: TalkXLimitsDraft): TalkXLimitsPayload {
  return {
    speed_profile: draft.speedProfile,
    send_interval_min: secondsToMs(draft.intervalMin),
    send_interval_max: secondsToMs(Math.max(draft.intervalMin, draft.intervalMax)),
    send_window_start: draft.windowStart ? `${draft.windowStart}:00` : null,
    send_window_end: draft.windowEnd ? `${draft.windowEnd}:00` : null,
    business_hours_only: draft.businessHoursOnly,
  };
}

/** X006: o intervalo digitado (segundos) respeita o piso e o teto do modal. */
export function isValidLimitsDraft(draft: TalkXLimitsDraft): boolean {
  return isValidIntervalSeconds(draft.intervalMin) && isValidIntervalSeconds(draft.intervalMax);
}

/** Intervalo do perfil de velocidade em segundos, para o select do modal. */
export function profileIntervalSeconds(profile: string): [number, number] {
  const [minMs, maxMs] = intervalForProfile(profile);
  return [msToSeconds(minMs), msToSeconds(maxMs)];
}
