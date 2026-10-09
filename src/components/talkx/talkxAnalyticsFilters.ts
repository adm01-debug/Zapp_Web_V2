import { createContext, useContext } from 'react';

/**
 * X185 — filtros da barra do Analytics (tela 07) e as contas puras que a tela usa.
 *
 * Módulo .ts de propósito: não exporta componente nenhum (a tela mora em
 * `TalkXAnalytics.tsx`, que só exporta o componente). O mesmo módulo guarda o
 * contexto lido pelos cartões da tela.
 */

export type AnalyticsPeriod = '7d' | '30d' | '90d' | 'month' | 'custom';

export const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '90 dias',
  month: 'Este mês',
  custom: 'Personalizado',
};

export const PERIOD_ORDER: AnalyticsPeriod[] = ['7d', '30d', '90d', 'month', 'custom'];

/** Filtros da barra como eles vivem no estado e na URL. */
export interface AnalyticsFilterValues {
  period: AnalyticsPeriod;
  channel: string;
  audienceSource: string;
  departmentId: string;
  from: string;
  to: string;
}

export const ANALYTICS_FILTER_DEFAULTS: AnalyticsFilterValues = {
  period: '30d', channel: 'all', audienceSource: 'all', departmentId: 'all', from: '', to: '',
};

export const CHANNEL_OPTIONS = [{ value: 'all', label: 'Todos os canais' }, { value: 'whatsapp', label: 'WhatsApp' }];

/** Origem do público aceita por `talkx_campaigns.audience_source` (CHECK do banco). */
export const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'contacts', label: 'Contatos' },
  { value: 'segment', label: 'Segmento' },
  { value: 'crm360', label: 'CRM 360' },
];

// Chaves curtas na URL: os filtros sobrevivem ao recarregar e podem ser compartilhados.
const URL_KEYS: Record<keyof AnalyticsFilterValues, string> = {
  period: 'txa_periodo', channel: 'txa_canal', audienceSource: 'txa_origem',
  departmentId: 'txa_equipe', from: 'txa_de', to: 'txa_ate',
};

/** Lê os filtros da URL, caindo no padrão em qualquer valor desconhecido. */
export function readAnalyticsFilters(search: string): AnalyticsFilterValues {
  const params = new URLSearchParams(search);
  const period = params.get(URL_KEYS.period) as AnalyticsPeriod | null;
  const canal = params.get(URL_KEYS.channel);
  const origem = params.get(URL_KEYS.audienceSource);
  const equipe = params.get(URL_KEYS.departmentId);
  return {
    period: period && PERIOD_ORDER.includes(period) ? period : ANALYTICS_FILTER_DEFAULTS.period,
    channel: CHANNEL_OPTIONS.some((o) => o.value === canal) ? (canal as string) : ANALYTICS_FILTER_DEFAULTS.channel,
    audienceSource: AUDIENCE_OPTIONS.some((o) => o.value === origem) ? (origem as string) : ANALYTICS_FILTER_DEFAULTS.audienceSource,
    departmentId: equipe ?? ANALYTICS_FILTER_DEFAULTS.departmentId,
    from: params.get(URL_KEYS.from) ?? '',
    to: params.get(URL_KEYS.to) ?? '',
  };
}

/** Grava os filtros na URL (sem navegar) para o recorte ser compartilhável. */
export function writeAnalyticsFilters(values: AnalyticsFilterValues) {
  if (typeof window === 'undefined' || !window.history) return;
  const url = new URL(window.location.href);
  (Object.keys(URL_KEYS) as (keyof AnalyticsFilterValues)[]).forEach((k) => {
    const v = values[k];
    if (!v || v === 'all' || (k === 'period' && v === ANALYTICS_FILTER_DEFAULTS.period)) url.searchParams.delete(URL_KEYS[k]);
    else url.searchParams.set(URL_KEYS[k], v);
  });
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

/** Converte o período escolhido no intervalo [from, to] que vai para a RPC. */
export function resolveAnalyticsRange(
  values: AnalyticsFilterValues,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  const from = new Date(now);
  switch (values.period) {
    case '7d': from.setDate(from.getDate() - 6); from.setHours(0, 0, 0, 0); break;
    case '30d': from.setDate(from.getDate() - 29); from.setHours(0, 0, 0, 0); break;
    case '90d': from.setDate(from.getDate() - 89); from.setHours(0, 0, 0, 0); break;
    case 'month': from.setDate(1); from.setHours(0, 0, 0, 0); break;
    case 'custom': {
      const f = values.from ? new Date(`${values.from}T00:00:00`) : null;
      const t = values.to ? new Date(`${values.to}T23:59:59.999`) : null;
      if (f && !Number.isNaN(f.getTime())) return { from: f, to: t && !Number.isNaN(t.getTime()) ? t : to };
      from.setDate(from.getDate() - 29); from.setHours(0, 0, 0, 0);
      break;
    }
    default: from.setDate(from.getDate() - 29); from.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

/** Taxa em texto ("12,3%"). */
export function pctTexto(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${String(v).replace('.', ',')}%`;
}

/** Valor formatado em reais, sem centavos (ex.: 284320 → "R$ 284.320"). */
export function fmtBRL(v: number | null | undefined): string | null {
  if (v == null) return null;
  return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

/** Linha do card "Comparativo de períodos". */
export interface AnalyticsCompareRow {
  label: string;
  atual: string;
  anterior: string;
  variacao: string | null;
}

/**
 * Contexto dos filtros do Analytics: os cartões da tela leem o MESMO recorte da
 * barra (nenhum card monta o próprio filtro por fora).
 */
export interface AnalyticsFiltersContextValue extends AnalyticsFilterValues {
  clear: () => void;
}

export const AnalyticsFiltersContext = createContext<AnalyticsFiltersContextValue | null>(null);

export function useAnalyticsFilters(): AnalyticsFiltersContextValue | null {
  return useContext(AnalyticsFiltersContext);
}
