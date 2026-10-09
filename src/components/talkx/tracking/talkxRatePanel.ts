/**
 * X147 (TL-156) — séries do ritmo de envio por minuto, para as telas 11 e 12.
 *
 * O painel do monitor (tela 11) entregava a série com quatro defeitos medidos no
 * inventário F11: janela fixa de 60 min (T11-031), minuto sem envio não virava ponto
 * zero (T11-033c), "Entregues" era contado no minuto do ENVIO e não no da ENTREGA
 * (T11-034) e não havia "Previsto" nem término estimado (T11-035/T11-036). A tela 12
 * desenhava a mesma série curta e sem legenda (T12-034..T12-040).
 *
 * Aqui ficam as funções puras que montam essa série a partir das linhas de
 * `talkx_recipients` (as mesmas que o monitor já lê) e a previsão derivada do ritmo
 * configurado na campanha. O contrato é o do painel do servidor (X140/CAP-087):
 * `series` com um ponto por minuto (zeros incluídos) e `forecast` com o previsto por
 * minuto e o término estimado — `forecast` nulo quando a campanha não tem ritmo
 * configurado, e aí não há linha "Previsto" nem balão de término.
 */
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { fmtRelativeDay } from '../kit/format';

/** Janelas oferecidas pelo seletor do card ("Últimos 60 / 30 / 15 minutos"). */
export type TalkXRateWindow = 15 | 30 | 60;
export const TALKX_RATE_WINDOWS: readonly TalkXRateWindow[] = [60, 30, 15];

/** Linha de `talkx_recipients` que alimenta a série. */
export interface TalkXRateRow {
  sent_at: string | null;
  delivered_at: string | null;
}

/** Um ponto por minuto da janela — sempre com os minutos sem evento (zero). */
export interface TalkXRatePoint {
  /** Rótulo curto do minuto (`HH:mm`, fuso do navegador). */
  time: string;
  /** Início do minuto em ISO — o tooltip usa o dia/hora exatos. */
  at: string;
  Enviadas: number;
  Entregues: number;
  /** Mensagens/min que o ritmo configurado prevê; só existe com `forecast`. */
  Previsto?: number;
}

/** Previsão do painel: nula quando a campanha não tem ritmo configurado. */
export interface TalkXRateForecast {
  /** Mensagens por minuto que o ritmo configurado permite. */
  perMinute: number;
  /** ISO do término estimado; nulo quando não há restantes a enviar. */
  etaAt: string | null;
  /** Minutos até o término; nulo junto com `etaAt`. */
  etaMinutes: number | null;
}

export interface TalkXRatePanel {
  series: TalkXRatePoint[];
  forecast: TalkXRateForecast | null;
}

const MINUTE_MS = 60_000;

/** Início do minuto local (segundos/ms zerados). */
function startOfMinute(date: Date): Date {
  const copy = new Date(date.getTime());
  copy.setSeconds(0, 0);
  return copy;
}

function shortTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Série da janela escolhida: um ponto por minuto CONSECUTIVO terminando no minuto de
 * `now` (zeros incluídos), "Enviadas" pelo minuto do envio e "Entregues" pelo minuto
 * da ENTREGA — uma mensagem enviada há 20 min e entregue agora aparece em "Entregues"
 * no minuto da entrega.
 */
export function buildRateSeries(
  rows: TalkXRateRow[],
  { windowMinutes, now = new Date() }: { windowMinutes: TalkXRateWindow; now?: Date },
): TalkXRatePoint[] {
  const end = startOfMinute(now);
  const startMs = end.getTime() - (windowMinutes - 1) * MINUTE_MS;

  const sent = new Array<number>(windowMinutes).fill(0);
  const delivered = new Array<number>(windowMinutes).fill(0);

  const bucketOf = (value: string | null): number | null => {
    if (!value) return null;
    const at = new Date(value).getTime();
    if (Number.isNaN(at)) return null;
    const index = Math.floor((startOfMinute(new Date(at)).getTime() - startMs) / MINUTE_MS);
    return index >= 0 && index < windowMinutes ? index : null;
  };

  for (const row of rows) {
    const sentAt = bucketOf(row.sent_at);
    if (sentAt !== null) sent[sentAt] += 1;
    const deliveredAt = bucketOf(row.delivered_at);
    if (deliveredAt !== null) delivered[deliveredAt] += 1;
  }

  return Array.from({ length: windowMinutes }, (_, index) => {
    const at = new Date(startMs + index * MINUTE_MS);
    return { time: shortTime(at), at: at.toISOString(), Enviadas: sent[index], Entregues: delivered[index] };
  });
}

/**
 * Previsto por minuto e término estimado a partir do ritmo configurado na campanha
 * (intervalo de envio + digitação, em ms — os dois valores do meio da faixa).
 *
 * Devolve `null` sem ritmo configurável (campanha ausente ou faixa zerada): a série
 * "Previsto" e o balão de término não existem nesse caso, em vez de inventar número.
 */
export function forecastFromCampaign(
  campaign: Pick<TalkXCampaign, 'send_interval_min' | 'send_interval_max' | 'typing_delay_min' | 'typing_delay_max'> | null | undefined,
  { pending = 0, now = new Date() }: { pending?: number; now?: Date } = {},
): TalkXRateForecast | null {
  if (!campaign) return null;
  const perMessageMs =
    (campaign.send_interval_min + campaign.send_interval_max) / 2 +
    (campaign.typing_delay_min + campaign.typing_delay_max) / 2;
  if (!Number.isFinite(perMessageMs) || perMessageMs <= 0) return null;

  const perMinute = Math.round((MINUTE_MS / perMessageMs) * 10) / 10;
  if (!Number.isFinite(perMinute) || perMinute <= 0) return null;

  const restantes = Number.isFinite(pending) && pending > 0 ? Math.floor(pending) : 0;
  if (restantes === 0) return { perMinute, etaAt: null, etaMinutes: null };

  const etaMinutes = Math.ceil(restantes / perMinute);
  return {
    perMinute,
    etaAt: new Date(now.getTime() + etaMinutes * MINUTE_MS).toISOString(),
    etaMinutes,
  };
}

/**
 * Série + previsão no formato do painel: os pontos ganham a coluna "Previsto" (a
 * linha tracejada só é desenhada quando há previsão) e `forecast` sai nulo quando a
 * campanha não tem ritmo configurado.
 */
export function buildRatePanel(
  rows: TalkXRateRow[],
  { windowMinutes, campaign, pending = 0, now = new Date() }: {
    windowMinutes: TalkXRateWindow;
    campaign: Pick<TalkXCampaign, 'send_interval_min' | 'send_interval_max' | 'typing_delay_min' | 'typing_delay_max'> | null | undefined;
    pending?: number;
    now?: Date;
  },
): TalkXRatePanel {
  const forecast = forecastFromCampaign(campaign, { pending, now });
  const base = buildRateSeries(rows, { windowMinutes, now });
  return {
    forecast,
    series: forecast ? base.map((point) => ({ ...point, Previsto: forecast.perMinute })) : base,
  };
}

/** Tooltip do gráfico: "Hoje, 14:32 · 12 mensagens/min" (N = envios daquele minuto). */
export function formatRateTooltipLabel(point: TalkXRatePoint): string {
  return `${fmtRelativeDay(point.at)} · ${point.Enviadas} mensagens/min`;
}

/** Balão de término da tela 11: "Término estimado · Hoje, 16:12 · em 54 min". */
export function formatRateEta(forecast: TalkXRateForecast | null): string | null {
  if (!forecast || !forecast.etaAt || forecast.etaMinutes === null) return null;
  return `Término estimado · ${fmtRelativeDay(forecast.etaAt)} · em ${forecast.etaMinutes} min`;
}
