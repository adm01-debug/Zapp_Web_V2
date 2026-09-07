import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { DashboardCard, SectionHeader, CardSelect } from './DashboardCard';
import { useRealSentimentData } from '../SentimentHelpers';

const LEGEND = [
  { key: 'positive', label: 'Positivo', dot: 'bg-dash-green', stroke: 'hsl(var(--dash-green))' },
  { key: 'neutral', label: 'Neutro', dot: 'bg-primary', stroke: 'hsl(var(--primary))' },
  { key: 'negative', label: 'Negativo', dot: 'bg-dash-red', stroke: 'hsl(var(--dash-red))' },
] as const;

export function SentimentTrendCard() {
  const [period, setPeriod] = useState<'7' | '14' | '30'>('14');
  const data = useRealSentimentData(parseInt(period, 10));

  return (
    <DashboardCard testid="sentiment-card" className="min-h-[173px]">
      <SectionHeader
        icon={TrendingUp}
        title="Tendência de Sentimento"
        tileSize={34}
        right={(
          <CardSelect
            testid="sentiment-select"
            value={period}
            onValueChange={(v) => setPeriod(v as '7' | '14' | '30')}
            options={[{ value: '7', label: '7 dias' }, { value: '14', label: '14 dias' }, { value: '30', label: '30 dias' }]}
          />
        )}
      />
      {!data || data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[12px] text-muted-foreground min-h-[100px]">
          Sem análises de sentimento no período
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 h-4 mb-1">
            {LEGEND.map((item) => (
              <span key={item.key} className="flex items-center gap-1.5 text-[11px] text-foreground-secondary">
                <span className={`w-2 h-2 rounded-full ${item.dot}`} />
                {item.label}
              </span>
            ))}
          </div>
          <div data-testid="sentiment-plot" className="h-[100px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} interval={Math.max(0, Math.floor(data.length / 5) - 1)} />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  ticks={[0, 50, 100]}
                  tickFormatter={(v) => `${v}%`}
                  width={32}
                  axisLine={false}
                  tickLine={false}
                />
                {LEGEND.map((item) => (
                  <Area key={item.key} type="monotone" dataKey={item.key} stroke={item.stroke} strokeWidth={2} fill={item.stroke} fillOpacity={0.15} dot={false} isAnimationActive />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </DashboardCard>
  );
}
