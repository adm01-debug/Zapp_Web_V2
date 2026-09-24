import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CHART_TICK_FONT_SIZE } from '@/lib/chart-theme';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MessageStats, TimePeriod } from './hooks/useEvolutionMonitoring';

interface Props {
  messageStats: MessageStats;
  period: TimePeriod;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-foreground mb-1">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-foreground">{p.value}</span>
        </div>
      ))}
      <div className="border-t border-border mt-1.5 pt-1.5 text-xs text-muted-foreground">
        Total: <span className="font-medium text-foreground">{payload.reduce((s, p) => s + p.value, 0)}</span>
      </div>
    </div>
  );
}

export function MonitoringMessageChart({ messageStats, period }: Props) {
  const [chartType, setChartType] = useState<'area' | 'step'>('area');

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Volume de Mensagens ({period})
          </CardTitle>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className={cn('h-7 text-xs', chartType === 'area' && 'bg-muted')} onClick={() => setChartType('area')}>Área</Button>
            <Button variant="ghost" size="sm" className={cn('h-7 text-xs', chartType === 'step' && 'bg-muted')} onClick={() => setChartType('step')}>Steps</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {messageStats.hourlyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={messageStats.hourlyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorIncoming" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorOutgoing" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="hour" tick={{ fontSize: CHART_TICK_FONT_SIZE }} />
              <YAxis allowDecimals={false} tick={{ fontSize: CHART_TICK_FONT_SIZE }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
              <Area type={chartType === 'area' ? 'monotone' : 'step'} dataKey="incoming" name="Recebidas" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorIncoming)" strokeWidth={2} dot={{ r: 2, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 2 }} />
              <Area type={chartType === 'area' ? 'monotone' : 'step'} dataKey="outgoing" name="Enviadas" stroke="hsl(142 71% 45%)" fillOpacity={1} fill="url(#colorOutgoing)" strokeWidth={2} dot={{ r: 2, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-[240px] text-muted-foreground">
            <BarChart3 className="w-10 h-10 mb-2 opacity-20" />
            <p className="text-sm">Sem dados de mensagens no período selecionado</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
