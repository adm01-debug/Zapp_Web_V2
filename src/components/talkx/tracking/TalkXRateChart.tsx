/**
 * X147 (TL-156) — card "Ritmo de Entrega" (tela 11) / "Ritmo de Envio" (tela 12).
 *
 * Card único das duas telas: título, seletor de janela ("Últimos 60 / 30 / 15
 * minutos"), a série "Enviadas" em área, "Entregues" tracejada pelo minuto da
 * entrega e "Previsto" tracejada (só quando o painel manda `forecast`), legenda,
 * linha de referência no limite por minuto configurado e o balão "Término estimado".
 * Sem envio na janela o card continua visível, com o estado de vazio do kit.
 *
 * O gráfico NÃO recebe filtro de status: a janela é a única coisa que o seletor
 * muda (T11-033a).
 */
import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Timer } from 'lucide-react';
import { CHART_TICK_FONT_SIZE, CHART_TOOLTIP_FONT_SIZE } from '@/lib/chart-theme';
import { TalkXQueryBoundary, type TalkXQueryLike } from '../kit/states';
import {
  TALKX_RATE_WINDOWS,
  formatRateEta,
  formatRateTooltipLabel,
  type TalkXRateForecast,
  type TalkXRatePoint,
  type TalkXRateWindow,
} from './talkxRatePanel';

export interface TalkXRateChartProps {
  /** "Ritmo de Entrega" (tela 11) ou "Ritmo de Envio" (tela 12). */
  title: string;
  /** Janela escolhida no seletor. */
  windowMinutes: TalkXRateWindow;
  /** Troca a janela; quem lê o painel refaz a leitura com a janela nova. */
  onWindowChange: (minutes: TalkXRateWindow) => void;
  /** Série do painel: um ponto por minuto da janela, zeros incluídos. */
  series: TalkXRatePoint[];
  /** Previsão do painel; nula quando a campanha não tem ritmo configurado. */
  forecast: TalkXRateForecast | null;
  /** Teto de mensagens por minuto configurado na campanha (linha de referência). */
  limitPerMinute?: number | null;
  /** Estado da leitura que alimenta a série. */
  query: TalkXQueryLike;
  onRetry?: () => void;
  /** A leitura bateu no teto de linhas: a série pode não cobrir a janela inteira. */
  truncated?: boolean;
}

interface RateTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: TalkXRatePoint }>;
}

function RateTooltip({ active, payload }: RateTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-2xs text-foreground shadow-lg">
      {formatRateTooltipLabel(point)}
    </div>
  );
}

/** Amostra da legenda: linha cheia para medida, tracejada para estimada. */
function LegendSample({ color, dashed }: { color: string; dashed: boolean }) {
  return <span aria-hidden="true" className={`w-4 shrink-0 border-t-2 ${dashed ? 'border-dashed' : ''}`} style={{ borderColor: color }} />;
}

export function TalkXRateChart({
  title,
  windowMinutes,
  onWindowChange,
  series,
  forecast,
  limitPerMinute = null,
  query,
  onRetry,
  truncated = false,
}: TalkXRateChartProps) {
  const semEnvio = series.length === 0 || series.every((point) => point.Enviadas === 0 && point.Entregues === 0);
  const points: TalkXRatePoint[] = forecast
    ? series.map((point) => ({ ...point, Previsto: forecast.perMinute }))
    : series;
  const eta = formatRateEta(forecast);
  const limite = typeof limitPerMinute === 'number' && limitPerMinute > 0 ? limitPerMinute : null;

  return (
    <section className="rounded-2xl bg-card border border-border/70 p-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">{title}</p>
          <p className="text-xs text-foreground-secondary">{`Mensagens enviadas nos últimos ${windowMinutes} minutos`}</p>
          {eta && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-2xs font-semibold text-foreground-secondary">
              <Timer className="h-3.5 w-3.5 text-primary" />
              {eta}
            </span>
          )}
        </div>
        <select
          value={windowMinutes}
          onChange={(event) => onWindowChange(Number(event.target.value) as TalkXRateWindow)}
          aria-label="Janela do ritmo"
          className="h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-xs font-medium shrink-0 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {TALKX_RATE_WINDOWS.map((minutes) => (
            <option key={minutes} value={minutes}>{`Últimos ${minutes} minutos`}</option>
          ))}
        </select>
      </div>

      <TalkXQueryBoundary
        query={query}
        entity="estatísticas de envio"
        onRetry={onRetry}
        skeleton={<div className="h-[160px] mt-3 rounded-xl bg-muted/40 motion-safe:animate-pulse" />}
        isEmpty={semEnvio}
        empty={<div className="h-[160px] mt-3 flex items-center justify-center text-xs text-muted-foreground">Sem envios neste período.</div>}
      >
        <div className="h-[160px] mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
              <defs>
                <linearGradient id="rg-talkx-rate" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="10%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/.4)" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: CHART_TICK_FONT_SIZE, fill: 'hsl(var(--foreground-secondary))' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: CHART_TICK_FONT_SIZE, fill: 'hsl(var(--foreground-secondary))' }} tickLine={false} axisLine={false} />
              <ReTooltip content={<RateTooltip />} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: CHART_TOOLTIP_FONT_SIZE }} />
              {limite !== null && (
                <ReferenceLine
                  y={limite}
                  stroke="hsl(var(--dash-amber))"
                  strokeDasharray="2 4"
                  label={{ value: `Limite ${limite}/min`, position: 'insideTopRight', fontSize: CHART_TICK_FONT_SIZE, fill: 'hsl(var(--foreground-secondary))' }}
                />
              )}
              <Area type="monotone" dataKey="Enviadas" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#rg-talkx-rate)" dot={false} />
              <Area type="monotone" dataKey="Entregues" stroke="hsl(var(--dash-green))" strokeWidth={2} strokeDasharray="4 4" fill="none" dot={false} />
              {forecast && (
                <Area type="monotone" dataKey="Previsto" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="2 4" fill="none" dot={false} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-2xs text-foreground-secondary">
          <span className="inline-flex items-center gap-1.5"><LegendSample color="hsl(var(--primary))" dashed={false} />Enviadas</span>
          <span className="inline-flex items-center gap-1.5"><LegendSample color="hsl(var(--dash-green))" dashed />Entregues</span>
          {forecast && (
            <span className="inline-flex items-center gap-1.5"><LegendSample color="hsl(var(--muted-foreground))" dashed />Previsto ({forecast.perMinute}/min)</span>
          )}
          {limite !== null && <span className="inline-flex items-center gap-1.5"><LegendSample color="hsl(var(--dash-amber))" dashed />Limite configurado</span>}
        </div>
        {truncated && (
          <p className="pt-1 text-2xs text-muted-foreground">Série limitada às 2.000 mensagens mais recentes.</p>
        )}
      </TalkXQueryBoundary>
    </section>
  );
}
