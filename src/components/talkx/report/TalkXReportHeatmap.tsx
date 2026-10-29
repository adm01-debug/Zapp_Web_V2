import { CalendarClock } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { IconTile, Td, Th, fmtInt } from '../talkxShared';
import {
  HEATMAP_LEGEND_STEPS,
  HEATMAP_METRICS,
  HEATMAP_WEEKDAYS,
  talkxReportHeatmapCellColor,
  talkxReportHeatmapGrid,
  talkxReportHeatmapHeading,
  type TalkXReportHeatmapMetric,
} from './talkxReportCharts';

/**
 * X164 / TL-080 — "Mapa de Calor" (tela 14): volume por dia da semana × horário.
 *
 * Apresentacional: a matriz 7×24 chega por prop do hook do relatório
 * (`talkx_campaign_report_breakdowns`), já no FUSO DA CAMPANHA
 * (`talkx_campaigns.schedule_timezone`) e com a LINHA 0 = segunda-feira (Seg→Dom).
 * Este componente não recalcula dia/hora — a grade é a do servidor.
 */

export interface TalkXReportHeatmapProps {
  /** Matriz 7×24 do servidor: linha 0 = segunda, no fuso da campanha. */
  matrix: number[][];
  metric: TalkXReportHeatmapMetric;
  onMetricChange: (metric: TalkXReportHeatmapMetric) => void;
}

export function TalkXReportHeatmap({ matrix, metric, onMetricChange }: TalkXReportHeatmapProps) {
  const grid = talkxReportHeatmapGrid(matrix);
  const heading = talkxReportHeatmapHeading(metric);
  const max = Math.max(0, ...grid.flat());

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconTile icon={CalendarClock} color="amber" size={36} />
          <div>
            <p className="text-[15px] font-bold text-foreground">{heading.title}</p>
            <p className="text-xs text-foreground-secondary">{heading.subtitle}</p>
          </div>
        </div>
        <Select value={metric} onValueChange={(v) => onMetricChange(v as TalkXReportHeatmapMetric)}>
          <SelectTrigger aria-label="Métrica" className="h-9 w-auto gap-1.5 rounded-lg border-border/70 bg-input/40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HEATMAP_METRICS.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="mb-1 ml-9 flex">
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="flex-1 text-center text-[9px] text-muted-foreground">
                {hour % 2 === 0 ? `${String(hour).padStart(2, '0')}h` : ''}
              </div>
            ))}
          </div>
          {HEATMAP_WEEKDAYS.map((day, weekday) => (
            <div key={day} data-testid={`heatmap-linha-${weekday}`} className="mb-0.5 flex items-center gap-1">
              <span className="w-8 shrink-0 text-right text-3xs text-foreground-secondary">{day}</span>
              <div className="flex flex-1 gap-0.5">
                {grid[weekday].map((value, hour) => (
                  <div
                    key={hour}
                    data-testid={`heatmap-${weekday}-${hour}`}
                    data-value={value}
                    title={`${day} ${String(hour).padStart(2, '0')}h · ${fmtInt(value)} ${heading.noun}`}
                    className="h-5 flex-1 rounded-[2px]"
                    style={{ background: talkxReportHeatmapCellColor(value, max) }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-2 text-2xs text-muted-foreground">
        <span>Menor volume</span>
        {HEATMAP_LEGEND_STEPS.map((step) => (
          <span key={step} data-testid="heatmap-legenda-amostra" data-step={step} className="h-2.5 w-3 rounded-sm" style={{ background: `hsl(var(--primary) / ${step})` }} />
        ))}
        <span>Maior volume</span>
      </div>

      <table className="sr-only">
        <caption>{`${heading.title} — volume de ${heading.noun} por dia da semana e horário`}</caption>
        <thead>
          <tr>
            <Th>Dia</Th>
            {Array.from({ length: 24 }, (_, hour) => (
              <Th key={hour}>{`${String(hour).padStart(2, '0')}h`}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, weekday) => (
            <tr key={HEATMAP_WEEKDAYS[weekday]}>
              <th scope="row">{HEATMAP_WEEKDAYS[weekday]}</th>
              {row.map((value, hour) => (
                <Td key={hour}>{fmtInt(value)}</Td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
