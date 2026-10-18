import React, { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis } from 'recharts';
import { Info, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconTile } from '../kit/primitives';
import { fmtInt } from '../kit/format';
import { CHART_TICK_FONT_SIZE, CHART_TOOLTIP_FONT_SIZE } from '@/lib/chart-theme';

/**
 * X186 — Performance de campanhas no tempo (tela 07 do Talk X).
 *
 * Um ponto por dia, quatro séries: Enviadas, Entregues, Respostas e Conversões.
 * Série cuja FONTE é nula (o sistema ainda não mede) não é desenhada e ganha a nota
 * "sem dados ainda" — nunca um zero inventado (A9).
 */

/** Ponto diário. `null` = a fonte daquela série ainda não recebeu dado nenhum. */
export interface PerformancePoint {
  /** Dia no fuso America/Sao_Paulo, no formato 'AAAA-MM-DD' (como a RPC devolve). */
  day: string;
  sent: number | null;
  delivered: number | null;
  replied: number | null;
  conversions: number | null;
}

export type PerformancePeriod = '7d' | '30d' | '90d';

/** Seletor PRÓPRIO do gráfico (padrão = filtro da tela, decidido por quem renderiza). */
const PERIOD_OPTIONS: { value: PerformancePeriod; label: string }[] = [
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
];

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

type SeriesKey = 'sent' | 'delivered' | 'replied' | 'conversions';

interface SeriesDef {
  key: SeriesKey;
  label: string;
  /** Token de cor do sistema (sem cor nova). */
  token: string;
  /** De onde o número vem — é o que o ícone (i) explica. */
  origin: string;
}

const SERIES: SeriesDef[] = [
  { key: 'sent', label: 'Enviadas', token: 'primary', origin: 'carimbo de envio de cada destinatário' },
  { key: 'delivered', label: 'Entregues', token: 'dash-green', origin: 'confirmação de entrega devolvida pelo provedor' },
  { key: 'replied', label: 'Respostas', token: 'violeta', origin: 'carimbo de resposta de cada destinatário' },
  { key: 'conversions', label: 'Conversões', token: 'dash-amber', origin: 'vendas registradas nos links da campanha' },
];

interface SeriesView { key: SeriesKey; label: string; color: string }
interface ChartView {
  /** Uma linha por dia do período; só as séries com fonte entram como chave. */
  rows: Array<Record<string, string | number | null>>;
  /** Séries efetivamente desenhadas (as que têm pelo menos um dia medido). */
  series: SeriesView[];
  /** Rótulos das séries sem fonte — a nota "sem dados ainda". */
  missing: string[];
}

/** '2026-10-01' → '1 out' (mesmo formato de data da régua da tela 07). */
function formatDayLabel(day: string): string {
  const [, month, dayOfMonth] = day.slice(0, 10).split('-');
  const monthLabel = MONTHS_PT[Number(month) - 1];
  if (!monthLabel || !dayOfMonth) return day;
  return `${Number(dayOfMonth)} ${monthLabel}`;
}

function buildChartView(points: PerformancePoint[]): ChartView {
  const series: SeriesView[] = [];
  const missing: string[] = [];
  for (const def of SERIES) {
    if (points.some((p) => typeof p[def.key] === 'number')) {
      series.push({ key: def.key, label: def.label, color: `hsl(var(--${def.token}))` });
    } else {
      missing.push(def.label);
    }
  }
  const rows = points.map((point) => {
    const row: Record<string, string | number | null> = { day: point.day, Dia: formatDayLabel(point.day) };
    for (const s of series) {
      const value = point[s.key];
      // `null` no meio da série = lacuna (o recharts não liga os pontos), não zero.
      row[s.label] = typeof value === 'number' ? value : null;
    }
    return row;
  });
  return { rows, series, missing };
}

interface Props {
  data: PerformancePoint[];
  period: PerformancePeriod;
  onPeriodChange: (period: PerformancePeriod) => void;
  isLoading?: boolean;
  /** Falha de leitura da série: NÃO pode virar "sem resultados". */
  isError?: boolean;
}

export function AnalyticsPerformanceChart({ data, period, onPeriodChange, isLoading, isError }: Props) {
  const [showOrigins, setShowOrigins] = useState(false);
  const view = useMemo(() => buildChartView(data), [data]);
  const tickInterval = Math.max(0, Math.ceil(view.rows.length / 8) - 1);

  return (
    <section className="rounded-2xl bg-card border border-border/70 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <IconTile icon={TrendingUp} color="green" size={36} />
          <div>
            <p className="text-[15px] font-bold text-foreground">Performance de campanhas</p>
            <p className="text-xs text-foreground-secondary">Séries diárias do período selecionado</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={period === option.value}
                onClick={() => onPeriodChange(option.value)}
                className={cn(
                  'h-7 px-2.5 rounded-lg text-2xs font-medium border transition-colors',
                  period === option.value
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border/70 bg-input/40 text-foreground-secondary hover:bg-muted/50',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-expanded={showOrigins}
            aria-label="De onde vem cada série"
            onClick={() => setShowOrigins((open) => !open)}
            className={cn(
              'h-7 w-7 rounded-lg border flex items-center justify-center transition-colors',
              showOrigins
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border/70 bg-input/40 text-foreground-secondary hover:bg-muted/50',
            )}
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showOrigins && (
        <ul className="mb-3 space-y-1 rounded-xl border border-border/60 bg-input/20 p-3">
          {SERIES.map((def) => (
            <li key={def.key} className="text-2xs text-foreground-secondary">
              <span className="font-semibold text-foreground">{def.label}:</span> {def.origin}
            </li>
          ))}
        </ul>
      )}

      {isLoading ? (
        <div className="h-[240px] rounded-xl bg-muted/30 motion-safe:animate-pulse" />
      ) : isError ? (
        <p className="text-[13px] text-muted-foreground py-10 text-center">Não foi possível carregar a série do período. Tente de novo em instantes.</p>
      ) : view.rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground py-10 text-center">Sem envios registrados no período selecionado.</p>
      ) : (
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={view.rows} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <defs>
                {view.series.map((s) => (
                  <linearGradient key={s.key} id={`perf-grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={s.color} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/.4)" vertical={false} />
              <XAxis
                dataKey="Dia"
                tick={{ fontSize: CHART_TICK_FONT_SIZE, fill: 'hsl(var(--foreground-secondary))' }}
                tickLine={false}
                axisLine={false}
                interval={tickInterval}
              />
              <YAxis
                tick={{ fontSize: CHART_TICK_FONT_SIZE, fill: 'hsl(var(--foreground-secondary))' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <ReTooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: CHART_TOOLTIP_FONT_SIZE }}
                formatter={(value: unknown) => (typeof value === 'number' ? fmtInt(value) : '—')}
              />
              {view.series.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  fill={`url(#perf-grad-${s.key})`}
                  dot={{ r: 2, strokeWidth: 0, fill: s.color }}
                  activeDot={{ r: 4 }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {view.missing.length > 0 && (
        <p className="text-2xs text-muted-foreground mt-2">
          {view.missing.map((label) => `${label}: sem dados ainda`).join(' · ')}
        </p>
      )}
    </section>
  );
}
