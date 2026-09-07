import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { DashboardCard, SectionHeader, CardSelect } from './DashboardCard';
import { useTodayHourlyVolume } from '@/hooks/dashboard/useTodayHourlyVolume';
import { useDemandPrediction } from '@/hooks/business/useDemandPrediction';

const HOUR_TICKS = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];

type Mode = 'hoje' | '7dias';

function CustomTooltip({ active, currentHourCount, avg7dCurrentHour }: { active?: boolean; currentHourCount: number; avg7dCurrentHour: number | null }) {
  if (!active) return null;
  const pct = avg7dCurrentHour && avg7dCurrentHour > 0 ? Math.round(((currentHourCount - avg7dCurrentHour) / avg7dCurrentHour) * 100) : null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 text-[11px]">
      <p className="text-muted-foreground">Agora</p>
      <p className="text-[12px] font-semibold text-foreground">{currentHourCount} conversas</p>
      {pct !== null && (
        <p className="text-foreground-secondary">{Math.abs(pct)}% {pct >= 0 ? 'acima' : 'abaixo'} da média</p>
      )}
    </div>
  );
}

export function VolumeChart() {
  const [mode, setMode] = useState<Mode>('hoje');
  const volumeQuery = useTodayHourlyVolume();
  const demand = useDemandPrediction();

  const hasPrediction = mode === 'hoje' && (demand.data ?? []).some((p) => p.isPrediction);

  const chartData = useMemo(() => {
    if (!volumeQuery.data) return [];
    if (mode === '7dias') {
      return volumeQuery.data.last7ByDay.map((d) => ({ label: format(parseISO(d.date), 'dd/MM', { locale: ptBR }), actual: d.count, predicted: undefined }));
    }
    const predictedByHour = new Map<number, number>();
    (demand.data ?? []).filter((p) => p.isPrediction).forEach((p) => {
      const hour = parseInt(p.time.split(':')[0], 10);
      if (!Number.isNaN(hour)) predictedByHour.set(hour, p.predicted);
    });
    return volumeQuery.data.todayByHour.map((count, h) => ({
      label: `${String(h).padStart(2, '0')}:00`,
      actual: count ?? undefined,
      predicted: predictedByHour.get(h),
    }));
  }, [volumeQuery.data, demand.data, mode]);

  const isEmpty = chartData.every((d) => !d.actual);

  return (
    <DashboardCard testid="volume-card" className="min-h-[259px]">
      <SectionHeader
        icon={BarChart3}
        title="Volume de Atendimentos"
        subtitle="Comparativo de conversas ao longo do tempo"
        tileSize={44}
        right={(
          <CardSelect
            testid="volume-select"
            value={mode}
            onValueChange={(v) => setMode(v as Mode)}
            options={[{ value: 'hoje', label: 'Hoje (por hora)' }, { value: '7dias', label: 'Últimos 7 dias (por dia)' }]}
          />
        )}
      />
      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center text-[12px] text-muted-foreground min-h-[160px]">
          Sem conversas no período
        </div>
      ) : (
        <div data-testid="volume-plot" className="h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / .5)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                ticks={mode === 'hoje' ? HOUR_TICKS : undefined}
                interval={mode === 'hoje' ? 0 : undefined}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={28} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ stroke: 'hsl(var(--border))', strokeDasharray: '4 4' }}
                content={<CustomTooltip currentHourCount={volumeQuery.data?.currentHourCount ?? 0} avg7dCurrentHour={volumeQuery.data?.avg7dCurrentHour ?? null} />}
              />
              <Area type="monotone" dataKey="actual" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#volumeFill)" dot={false} activeDot={{ r: 3 }} isAnimationActive />
              {hasPrediction && (
                <Line type="monotone" dataKey="predicted" stroke="hsl(var(--primary))" strokeDasharray="4 4" strokeWidth={2} dot={false} isAnimationActive />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="flex items-center gap-4 h-4 mt-1 text-[11px] text-foreground-secondary">
        <span>— Conversas reais</span>
        {hasPrediction && <span>╌ Previsão IA</span>}
      </div>
    </DashboardCard>
  );
}
