import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, ArrowRight, BarChart3 } from 'lucide-react';
import { ReportsIntegrityNotice } from './ReportsIntegrityNotice';

interface PeriodData {
  label: string;
  /** `null` = leitura falhou: o valor NÃO é zero confirmado. */
  total: number | null;
  resolved: number | null;
}

interface ComparisonState {
  current: PeriodData;
  previous: PeriodData;
  error: unknown | null;
}

const EMPTY = '—';

/** Só considera o número quando a leitura não falhou; erro vira "desconhecido". */
function readCount(result: { count?: number | null; error?: unknown }): number | null {
  if (result?.error) return null;
  return typeof result?.count === 'number' ? result.count : null;
}

export function PeriodComparison() {
  const [comparison, setComparison] = useState<ComparisonState | null>(null);
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(true);

  const loadComparison = useCallback(async () => {
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
        total: readCount(currentRes),
        resolved: readCount(currentClosures),
      },
      previous: {
        label: period === 'week' ? 'Semana passada' : 'Mês passado',
        total: readCount(previousRes),
        resolved: readCount(previousClosures),
      },
      error: currentRes?.error ?? previousRes?.error ?? currentClosures?.error ?? previousClosures?.error ?? null,
    });
    setLoading(false);
  }, [period]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/troca-de-período padrão, sem estado derivado de props para sincronizar.
    loadComparison();
  }, [loadComparison]);

  const VariationBadge = ({ current, previous }: { current: number | null; previous: number | null }) => {
    // Sem base de comparação: leitura falhou (valor desconhecido) ou período anterior sem registros (0).
    // Nunca inventa +100% nem 0 falso.
    if (current === null || previous === null || previous === 0) {
      return (
        <span className="text-3xs text-muted-foreground" data-testid="variation-no-base">
          sem base de comparação
        </span>
      );
    }
    const variation = Math.round(((current - previous) / previous) * 100);
    const isPositive = variation > 0;
    const isNegative = variation < 0;
    return (
      <Badge variant="outline" className={`text-3xs ${isPositive ? 'text-success border-success/30' : isNegative ? 'text-destructive border-destructive/30' : 'text-muted-foreground'}`}>
        {isPositive ? <TrendingUp className="w-3 h-3 mr-0.5" /> : isNegative ? <TrendingDown className="w-3 h-3 mr-0.5" /> : null}
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
            <SelectTrigger aria-label="Período" className="w-32 h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Semanal</SelectItem>
              <SelectItem value="month">Mensal</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <ReportsIntegrityNotice error={comparison.error} />
          {metrics.map((m) => (
            <div key={m.label} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{m.label}</span>
                <VariationBadge current={m.current} previous={m.previous} />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 text-center p-2 rounded-lg bg-muted/20">
                  <p className="text-lg font-bold">{m.previous ?? EMPTY}</p>
                  <p className="text-3xs text-muted-foreground">{comparison.previous.label}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 text-center p-2 rounded-lg bg-primary/10">
                  <p className="text-lg font-bold text-primary">{m.current ?? EMPTY}</p>
                  <p className="text-3xs text-muted-foreground">{comparison.current.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
