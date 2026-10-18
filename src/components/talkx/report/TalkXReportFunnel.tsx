import { Filter as FilterIcon } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { IconTile, Td, Th, fmtInt } from '../talkxShared';
import {
  FUNNEL_STEP_COLORS,
  talkxReportFunnelRows,
  talkxReportPctText,
  talkxReportTrapezoidPoints,
  type TalkXReportFunnelSegment,
  type TalkXReportFunnelStep,
} from './talkxReportCharts';

/**
 * X164 / TL-080 — "Funil de Conversão" (tela 14): 5 degraus do envio à conversão.
 *
 * Apresentacional: os degraus vêm por prop do hook do relatório (RPC da trilha de
 * banco). Degrau com `count` nulo não tem fonte (campanha sem link / sem fonte de
 * conversão) e NÃO é desenhado.
 *
 * Geometria: cada trapézio é proporcional ao % do degrau sobre os ENVIADOS; a aresta de
 * baixo usa o % do degrau seguinte (a boca do funil).
 */

export interface TalkXReportFunnelProps {
  steps: TalkXReportFunnelStep[];
  /** Segmentos da campanha: com 1 ou nenhum o seletor não aparece. */
  segments: TalkXReportFunnelSegment[];
  segmentId: string | null;
  onSegmentChange: (segmentId: string | null) => void;
}

export function TalkXReportFunnel({ steps, segments, segmentId, onSegmentChange }: TalkXReportFunnelProps) {
  const rows = talkxReportFunnelRows(steps);
  const showSegmentSelect = segments.length > 1;

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconTile icon={FilterIcon} color="violet" size={36} />
          <div>
            <p className="text-[15px] font-bold text-foreground">Funil de Conversão</p>
            <p className="text-xs text-foreground-secondary">Do envio à conversão</p>
          </div>
        </div>
        {showSegmentSelect && (
          <Select value={segmentId ?? 'all'} onValueChange={(v) => onSegmentChange(v === 'all' ? null : v)}>
            <SelectTrigger aria-label="Segmento" className="h-9 w-auto gap-1.5 rounded-lg border-border/70 bg-input/40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os segmentos</SelectItem>
              {segments.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">Sem degraus no período selecionado.</p>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="min-w-0 flex-1">
            <svg
              viewBox={`0 0 100 ${rows.length * 100}`}
              preserveAspectRatio="none"
              className="w-full"
              style={{ height: rows.length * 40 }}
              aria-hidden="true"
            >
              {rows.map((row, i) => (
                <polygon
                  key={row.key}
                  data-testid={`funil-degrau-${row.key}`}
                  data-pct={row.pct.toFixed(1)}
                  points={talkxReportTrapezoidPoints(row.pct, rows[i + 1]?.pct ?? row.pct, i)}
                  fill={FUNNEL_STEP_COLORS[row.key]}
                  fillOpacity={0.22}
                  stroke={FUNNEL_STEP_COLORS[row.key]}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          </div>
          <ul className="flex flex-col gap-2 sm:w-[230px]">
            {rows.map((row) => (
              <li key={row.key} className="text-[13px] font-semibold tabular-nums text-foreground">
                {`${fmtInt(row.count)} · ${talkxReportPctText(row.pct)} · ${row.label}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <table className="sr-only">
        <caption>Funil de conversão — do envio à conversão</caption>
        <thead>
          <tr>
            <Th>Degrau</Th>
            <Th>Total</Th>
            <Th>% sobre enviados</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              <Td>{fmtInt(row.count)}</Td>
              <Td>{talkxReportPctText(row.pct)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
