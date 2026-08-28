import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Calendar, AlertTriangle, Clock } from 'lucide-react';
import { format, subDays, startOfDay, getDay, getHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart } from 'recharts';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function DemandForecast() {
  const [historicalData, setHistoricalData] = useState<{ day: string; actual: number; predicted: number }[]>([]);
  const [peakHours, setPeakHours] = useState<{ hour: number; avg: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadForecast();
  }, []);

  const loadForecast = async () => {
    setLoading(true);
    const since = subDays(new Date(), 28);

    const { data: messages } = await supabase
      .from('messages')
      .select('created_at')
      .gte('created_at', since.toISOString())
      .eq('sender', 'contact')
      .limit(1000);

    if (!messages) { setLoading(false); return; }

    // Group by day of week
    const dayBuckets: Record<number, number[]> = {};
    const hourBuckets: Record<number, number[]> = {};
    for (let i = 0; i < 7; i++) dayBuckets[i] = [];
    for (let i = 0; i < 24; i++) hourBuckets[i] = [];

    messages.forEach(m => {
      const d = new Date(m.created_at);
      const dayOfWeek = getDay(d);
      const hour = getHours(d);
      const dayKey = format(startOfDay(d), 'yyyy-MM-dd');
      dayBuckets[dayOfWeek].push(1);
      hourBuckets[hour].push(1);
    });

    // Build day forecast (next 7 days)
    const today = new Date();
    const forecast: typeof historicalData = [];
    for (let i = 0; i < 7; i++) {
      const targetDate = subDays(today, -i);
      const dayOfWeek = getDay(targetDate);
      const avgForDay = dayBuckets[dayOfWeek].length > 0
        ? Math.round(dayBuckets[dayOfWeek].length / 4)
        : 0;
      const variance = Math.round(avgForDay * 0.15);
      forecast.push({
        day: format(targetDate, 'EEE dd/MM', { locale: ptBR }),
        actual: i === 0 ? avgForDay : 0,
        predicted: avgForDay + (i > 0 ? Math.round(Math.random() * variance * 2 - variance) : 0),
      });
    }
    setHistoricalData(forecast);

    // Peak hours
    const peaks = Object.entries(hourBuckets)
      .map(([h, counts]) => ({ hour: parseInt(h), avg: Math.round(counts.length / 28) }))
      .sort((a, b) => b.avg - a.avg);
    setPeakHours(peaks);

    setLoading(false);
  };

  const topPeaks = peakHours.slice(0, 5);
  const totalPredicted = historicalData.reduce((s, d) => s + d.predicted, 0);

  if (loading) {
    return <Card><CardContent className="p-6"><div className="h-48 bg-muted/20 rounded-xl animate-pulse" /></CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          Previsão de Demanda (7 dias)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 rounded-lg bg-primary/5">
            <p className="text-lg font-bold text-primary">{totalPredicted}</p>
            <p className="text-[10px] text-muted-foreground">Msgs previstas</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-warning/5">
            <p className="text-lg font-bold text-warning">{topPeaks[0]?.hour ?? '-'}h</p>
            <p className="text-[10px] text-muted-foreground">Hora de pico</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/10">
            <p className="text-lg font-bold">{DAYS[getDay(new Date())]}</p>
            <p className="text-[10px] text-muted-foreground">Dia atual</p>
          </div>
        </div>

        {/* Chart */}
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={historicalData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/20" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="predicted" fill="hsl(var(--primary))" opacity={0.6} radius={[4, 4, 0, 0]} name="Previsto" />
              <Line type="monotone" dataKey="predicted" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Tendência" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Peak hours */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Horários de pico
          </p>
          <div className="flex flex-wrap gap-1.5">
            {topPeaks.map(p => (
              <Badge key={p.hour} variant="outline" className="text-[10px]">
                {String(p.hour).padStart(2, '0')}h — ~{p.avg} msg/dia
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
