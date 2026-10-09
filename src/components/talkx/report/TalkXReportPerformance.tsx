import { AreaChart as AreaChartIcon } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CHART_TICK_FONT_SIZE, CHART_TICK_FONT_SIZE_SM, CHART_TOOLTIP_FONT_SIZE } from '@/lib/chart-theme';

import { IconTile, TalkXNoData, Td, Th, fmtInt } from '../talkxShared';
import {
  TALKX_REPORT_GRANULARITY_LABELS,
  TALKX_REPORT_SERIES_COLORS,
  talkxReportAxisLabel,
  talkxReportBucketTitle,
  talkxReportSeriesLines,
  type TalkXReportGranularity,
  type TalkXReportSeriesPoint,
} from './talkxReportCharts';

/**
 * X164 / TL-080 — "Desempenho da Campanha" (tela 14): as 4 séries do relatório.
 *
 * Apresentacional de propósito: os dados chegam por prop do hook do relatório, que é
 * quem chama `talkx_campaign_report` (etapas da trilha de banco/front). Este componente
 * não fala com o banco.
 */

export interface TalkXReportPerformanceProps {
  series: TalkXReportSeriesPoint[];
  granularity: TalkXReportGranularity;
  onGranularityChange: (granularity: TalkXReportGranularity) => void;
  /** `talkx_campaigns.schedule_timezone` — fuso usado em todos os rótulos de data. */
  timeZone: string;
  /** Campanha sem link ou sem fonte de conversão: a série Conversões não é desenhada. */
  hasConversionSource: boolean;
}

interface PerfTooltipProps {
  active?: boolean;
  payload?: { payload: TalkXReportSeriesPoint }[];
  granularity: TalkXReportGranularity;
  timeZone: string;
  hasConversionSource: boolean;
}

function PerformanceTooltip({ active, payload, granularity, timeZone, hasConversionSource }: PerfTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 shadow-md">
      <p className="text-xs font-semibold text-foreground">{talkxReportBucketTitle(point.bucket, granularity, timeZone)}</p>
      {talkxReportSeriesLines(hasConversionSource).map((line) => (
        <p key={line.key} className="mt-0.5 text-2xs text-foreground-secondary">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: line.color }} />
          {line.label} <span className="font-semibold tabular-nums text-foreground">{fmtInt(point[line.key])}</span>
        </p>
      ))}
    </div>
  );
}

export function TalkXReportPerformance({ series, granularity, onGranularityChange, timeZone, hasConversionSource }: TalkXReportPerformanceProps) {
  const lines = talkxReportSeriesLines(hasConversionSource);

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconTile icon={AreaChartIcon} color="blue" size={36} />
          <div>
            <p className="text-[15px] font-bold text-foreground">Desempenho da Campanha</p>
            <p className="text-xs text-foreground-secondary">Mensagens enviadas, entregues, respostas e conversões ao longo do tempo</p>
          </div>
        </div>
        <Select value={granularity} onValueChange={(v) => onGranularityChange(v as TalkXReportGranularity)}>
          <SelectTrigger aria-label="Granularidade" className="h-9 w-auto gap-1.5 rounded-lg border-border/70 bg-input/40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(TALKX_REPORT_GRANULARITY_LABELS) as TalkXReportGranularity[]).map((g) => (
              <SelectItem key={g} value={g}>{TALKX_REPORT_GRANULARITY_LABELS[g]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {series.length === 0 ? (
        <TalkXNoData hint="Sem série de desempenho no período selecionado." />
      ) : (
        <>
          <div className="h-[260px] w-full" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="talkx-report-sent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={TALKX_REPORT_SERIES_COLORS.sent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={TALKX_REPORT_SERIES_COLORS.sent} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="talkx-report-delivered" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={TALKX_REPORT_SERIES_COLORS.delivered} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={TALKX_REPORT_SERIES_COLORS.delivered} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/.4)" vertical={false} />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(b: string) => talkxReportAxisLabel(b, granularity, timeZone)}
                  tick={{ fontSize: CHART_TICK_FONT_SIZE_SM }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis tick={{ fontSize: CHART_TICK_FONT_SIZE }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <Tooltip
                  content={<PerformanceTooltip granularity={granularity} timeZone={timeZone} hasConversionSource={hasConversionSource} />}
                  contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: CHART_TOOLTIP_FONT_SIZE }}
                />
                <Area type="monotone" dataKey="sent" stroke={TALKX_REPORT_SERIES_COLORS.sent} fill="url(#talkx-report-sent)" strokeWidth={2} />
                <Area type="monotone" dataKey="delivered" stroke={TALKX_REPORT_SERIES_COLORS.delivered} fill="url(#talkx-report-delivered)" strokeWidth={2} />
                <Line type="monotone" dataKey="replied" stroke={TALKX_REPORT_SERIES_COLORS.replied} strokeWidth={2} dot={false} />
                {hasConversionSource && <Line type="monotone" dataKey="conversions" stroke={TALKX_REPORT_SERIES_COLORS.conversions} strokeWidth={2} dot={false} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <ul className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-foreground-secondary">
            {lines.map((line) => (
              <li key={line.key} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm" style={{ background: line.color }} />
                {line.label}
              </li>
            ))}
          </ul>

          <table className="sr-only">
            <caption>Desempenho da campanha — {TALKX_REPORT_GRANULARITY_LABELS[granularity]}</caption>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Enviados</Th>
                <Th>Entregues</Th>
                <Th>Respostas</Th>
                {hasConversionSource && <Th>Conversões</Th>}
              </tr>
            </thead>
            <tbody>
              {series.map((point) => (
                <tr key={point.bucket}>
                  <Td>{talkxReportBucketTitle(point.bucket, granularity, timeZone)}</Td>
                  <Td>{fmtInt(point.sent)}</Td>
                  <Td>{fmtInt(point.delivered)}</Td>
                  <Td>{fmtInt(point.replied)}</Td>
                  {hasConversionSource && <Td>{fmtInt(point.conversions)}</Td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
