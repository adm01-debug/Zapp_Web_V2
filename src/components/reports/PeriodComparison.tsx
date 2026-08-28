import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, ArrowRight, BarChart3 } from 'lucide-react';

interface PeriodData {
  label: string;
  total: number;
  resolved: number;
  avgResponseTime: number;
}

export function PeriodComparison() {
  const [comparison, setComparison] = useState<{ current: PeriodData; previous: PeriodData } | null>(null);
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadComparison();
  }, [period]);

  const loadComparison = async () => {
    setLoading(true);
    const now = new Date();
    let currentStart: Date, previousStart: Date, previousEnd: Date;

    if (period === 'week') {
      currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      previousEnd = new Date(currentStart.getTime());
      previousStart = new Date(previousEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      previousEnd = new Date(currentStart.getTime());
      previousStart = new Date(previousEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const [currentRes, previousRes] = await Promise.all([
      supabase.from('messages').select('id', { count: 'exact', head: true })
        .gte('created_at', currentStart.toISOString()).eq('sender', 'contact'),
      supabase.from('messages').select('id', { count: 'exact', head: true })
        .gte('created_at', previousStart.toISOString())
        .lt('created_at', previousEnd.toISOString()).eq('sender', 'contact'),
    ]);

    const [currentClosures, previousClosures] = await Promise.all([
      supabase.from('conversation_closures').select('id', { count: 'exact', head: true })
        .gte('created_at', currentStart.toISOString()),
      supabase.from('conversation_closures').select('id', { count: 'exact', head: true })
        .gte('created_at', previousStart.toISOString())
        .lt('created_at', previousEnd.toISOString()),
    ]);

    setComparison({
      current: {
        label: period === 'week' ? 'Esta semana' : 'Este mês',
        total: currentRes.count || 0,
        resolved: currentClosures.count || 0,
        avgResponseTime: 0,
      },
      previous: {
        label: period === 'week' ? 'Semana passada' : 'Mês passado',
        total: previousRes.count || 0,
        resolved: previousClosures.count || 0,
        avgResponseTime: 0,
      },
    });
    setLoading(false);
  };

  const getVariation = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const VariationBadge = ({ current, previous, inverted = false }: { current: number; previous: number; inverted?: boolean }) => {
    const variation = getVariation(current, previous);
    const isPositive = inverted ? variation < 0 : variation > 0;
    return (
      <Badge variant="outline" className={`text-[10px] ${isPositive ? 'text-success border-success/30' : variation < 0 ? 'text-destructive border-destructive/30' : 'text-muted-foreground'}`}>
        {isPositive ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
        {variation > 0 ? '+' : ''}{variation}%
      </Badge>
    );
  };

  if (loading) {
    return <Card><CardContent className="p-6"><div className="h-32 bg-muted/20 rounded-xl animate-pulse" /></CardContent></Card>;
  }

  if (!comparison) return null;

  const metrics = [
    { label: 'Mensagens recebidas', current: comparison.current.total, previous: comparison.previous.total },
    { label: 'Conversas encerradas', current: comparison.current.resolved, previous: comparison.previous.resolved },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Comparativo entre Períodos
          </CardTitle>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32 h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Semanal</SelectItem>
              <SelectItem value="month">Mensal</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {metrics.map((m) => (
            <div key={m.label} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{m.label}</span>
                <VariationBadge current={m.current} previous={m.previous} />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 text-center p-2 rounded-lg bg-muted/20">
                  <p className="text-lg font-bold">{m.previous}</p>
                  <p className="text-[10px] text-muted-foreground">{comparison.previous.label}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 text-center p-2 rounded-lg bg-primary/10">
                  <p className="text-lg font-bold text-primary">{m.current}</p>
                  <p className="text-[10px] text-muted-foreground">{comparison.current.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
