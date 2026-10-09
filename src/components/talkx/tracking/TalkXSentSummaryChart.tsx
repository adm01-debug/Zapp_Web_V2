// TalkXSentSummaryChart.tsx — X160 (T13-050…T13-057): card "Resumo de Enviados" da tela 13.
//
// Recebe a série PRONTA do painel da campanha (baldes de HORA, janela de 6/12/24 h) e não
// calcula métrica a partir de linhas nem faz chamada própria: quem monta a tela entrega
// `points` com `p_bucket='hour'` e `p_window_minutes` da janela escolhida — o select devolve
// a escolha por `onWindowChange` para o painel ser pedido de novo.
// Contas e marcador da pausa ficam em `talkxSentSummary.ts`, testáveis sem React.
import React, { useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, Legend, ReferenceLine,
} from 'recharts';
import { Send } from 'lucide-react';
import { CHART_TICK_FONT_SIZE, CHART_TOOLTIP_FONT_SIZE } from '@/lib/chart-theme';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pill } from '@/components/dashboard/overview/DashboardCard';
import { RailCard, TalkXSkeletonRows, fmtInt } from '../talkxShared';
import {
  SUMMARY_WINDOWS, pausedMarker, summaryTotals,
  type TalkXSentSummaryPoint, type TalkXSummaryWindow,
} from './talkxSentSummary';

const CHANNELS = [
  { key: 'sent', label: 'Enviados', tone: 'info', color: 'hsl(var(--primary))' },
  { key: 'delivered', label: 'Entregues', tone: 'success', color: 'hsl(var(--dash-green))' },
  { key: 'replied', label: 'Respostas', tone: 'violet', color: 'hsl(var(--dash-violet))' },
] as const;

function horaLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface TalkXSentSummaryChartProps {
  points: TalkXSentSummaryPoint[];
  /** `paused_at` da campanha; fora da janela da série, nenhum marcador é desenhado. */
  pausedAt?: string | null;
  windowId?: TalkXSummaryWindow;
  onWindowChange?: (windowId: TalkXSummaryWindow) => void;
  /** Enquanto o painel não volta: esqueleto, nunca "nenhum envio". */
  loading?: boolean;
}

export function TalkXSentSummaryChart({
  points,
  pausedAt = null,
  windowId = '24h',
  onWindowChange,
  loading = false,
}: TalkXSentSummaryChartProps) {
  const data = useMemo(
    () => points.map((p) => ({
      time: horaLabel(p.bucket),
      Enviados: p.sent ?? 0,
      Entregues: p.delivered ?? 0,
      Respostas: p.replied ?? 0,
    })),
    [points],
  );
  const totals = useMemo(() => summaryTotals(points), [points]);
  const marker = useMemo(() => pausedMarker(pausedAt, points), [pausedAt, points]);

  return (
    <RailCard
      icon={Send}
      color="blue"
      title="Resumo de Enviados"
      subtitle="Envios, entregas e respostas por hora"
      right={(
        <Select value={windowId} onValueChange={(v) => onWindowChange?.(v as TalkXSummaryWindow)}>
          <SelectTrigger
            aria-label="Janela do resumo de enviados"
            className="h-9 w-[170px] text-xs bg-input/40 border-border/70"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUMMARY_WINDOWS.map((w) => (
              <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {CHANNELS.map((c) => (
          <Pill key={c.key} tone={c.tone} label={`${c.label} ${fmtInt(totals[c.key])}`} />
        ))}
      </div>
      {loading ? (
        <TalkXSkeletonRows rows={4} />
      ) : points.length === 0 ? (
        <p className="text-xs text-foreground-secondary">Nenhum envio registrado nesta campanha ainda.</p>
      ) : (
        <div className="h-[200px] pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/.4)" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: CHART_TICK_FONT_SIZE, fill: 'hsl(var(--foreground-secondary))' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: CHART_TICK_FONT_SIZE, fill: 'hsl(var(--foreground-secondary))' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <ReTooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: CHART_TOOLTIP_FONT_SIZE,
                }}
              />
              <Legend wrapperStyle={{ fontSize: CHART_TICK_FONT_SIZE }} />
              {marker && (
                <ReferenceLine
                  x={marker.anchor}
                  stroke="hsl(var(--dash-amber))"
                  strokeDasharray="4 4"
                  label={{
                    value: marker.label,
                    position: 'insideTopRight',
                    fill: 'hsl(var(--dash-amber))',
                    fontSize: CHART_TICK_FONT_SIZE,
                  }}
                />
              )}
              <Line type="monotone" dataKey="Enviados" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Entregues" stroke="hsl(var(--dash-green))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Respostas" stroke="hsl(var(--dash-violet))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </RailCard>
  );
}
