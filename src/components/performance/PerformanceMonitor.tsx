import { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw, TrendingUp, Database, Trash2, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { usePerformanceSnapshots } from '@/hooks/analytics/usePerformanceSnapshots';
import { formatRelativeTime } from '@/lib/formatters';

/**
 * 'unknown' = a API de medição não existe no navegador (performance.memory e
 * navigator.connection são só do Chromium). Métrica sem medição NÃO é "Bom":
 * fica no denominador do score e não pode virar 0 MB / 0 ms / '4g'.
 */
type MetricStatus = 'good' | 'warning' | 'critical' | 'unknown';

interface PerformanceMetric {
  name: string;
  value: number | null; // null = não medido (nunca um valor inventado)
  unit: string;
  status: MetricStatus;
}

export function PerformanceMonitor() {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [localHistory, setLocalHistory] = useState<Array<{ time: string; fcp: number; memory: number | null }>>([]);
  const [cacheStats, setCacheStats] = useState({ hits: 0, misses: 0, size: 0 });
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState('24');
  const { history: dbHistory, loading: dbLoading, saveSnapshot, loadHistory, clearOldSnapshots } = usePerformanceSnapshots();

  const collectMetrics = useCallback(async () => {
    setLoading(true);
    const perf = performance;
    const nav = perf.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const fcp = perf.getEntriesByName('first-contentful-paint')[0];
    const fcpValue = fcp ? Math.round(fcp.startTime) : 0;

    // performance.memory é só do Chromium: sem a API a memória NÃO foi medida.
    // Antes o ausente virava "0 MB usados / 0%" — memória livre, métrica "Bom".
    const memInfo = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
    const memoryUsed = memInfo ? Math.round(memInfo.usedJSHeapSize / 1048576) : null;
    const memoryTotal = memInfo ? Math.round(memInfo.totalJSHeapSize / 1048576) : null;
    const memoryPercent = memInfo ? Math.round((memInfo.usedJSHeapSize / memInfo.totalJSHeapSize) * 100) : null;

    const domNodes = document.querySelectorAll('*').length;
    // navigator.connection também é só do Chromium: sem effectiveType/rtt não há
    // medição — os padrões '4g' e 0 ms davam a melhor nota possível ao ausente.
    const conn = (navigator as unknown as { connection?: { effectiveType?: string; rtt?: number } }).connection;
    const networkType = conn?.effectiveType ?? null;
    const rtt = typeof conn?.rtt === 'number' ? conn.rtt : null;

    const pageLoadTime = nav ? Math.round(nav.loadEventEnd - nav.startTime) : 0;
    const domReady = nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : 0;
    const ttfb = nav ? Math.round(nav.responseStart - nav.requestStart) : 0;

    const newMetrics: PerformanceMetric[] = [
      { name: 'FCP', value: fcpValue, unit: 'ms', status: fcpValue < 1800 ? 'good' : fcpValue < 3000 ? 'warning' : 'critical' },
      { name: 'Page Load', value: pageLoadTime, unit: 'ms', status: pageLoadTime < 3000 ? 'good' : pageLoadTime < 5000 ? 'warning' : 'critical' },
      { name: 'DOM Ready', value: domReady, unit: 'ms', status: domReady < 2000 ? 'good' : domReady < 4000 ? 'warning' : 'critical' },
      { name: 'TTFB', value: ttfb, unit: 'ms', status: ttfb < 200 ? 'good' : ttfb < 500 ? 'warning' : 'critical' },
      {
        name: 'Memória JS',
        value: memoryUsed,
        unit: memoryUsed === null ? '' : `MB / ${memoryTotal}MB`,
        status: memoryPercent === null ? 'unknown' : memoryPercent < 60 ? 'good' : memoryPercent < 80 ? 'warning' : 'critical',
      },
      { name: 'DOM Nodes', value: domNodes, unit: 'nós', status: domNodes < 1500 ? 'good' : domNodes < 3000 ? 'warning' : 'critical' },
      {
        name: 'RTT',
        value: rtt,
        unit: rtt === null ? '' : 'ms',
        status: rtt === null ? 'unknown' : rtt < 100 ? 'good' : rtt < 300 ? 'warning' : 'critical',
      },
      {
        name: 'Conexão',
        value: networkType === null ? null : networkType === '4g' ? 100 : networkType === '3g' ? 60 : 30,
        unit: networkType ?? '',
        status: networkType === null ? 'unknown' : networkType === '4g' ? 'good' : networkType === '3g' ? 'warning' : 'critical',
      },
    ];

    setMetrics(newMetrics);

    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLocalHistory(prev => [...prev.slice(-20), { time: now, fcp: fcpValue, memory: memoryUsed }]);

    const cacheKeys = Object.keys(localStorage).filter(k => k.startsWith('cache_') || k.startsWith('tanstack'));
    setCacheStats({
      hits: Number.parseInt(localStorage.getItem('cache_hits') || '0'),
      misses: Number.parseInt(localStorage.getItem('cache_misses') || '0'),
      size: cacheKeys.length,
    });

    // Persist to Supabase
    const overallScore = Math.round((newMetrics.filter(m => m.status === 'good').length / Math.max(newMetrics.length, 1)) * 100);
    await saveSnapshot({
      fcp: fcpValue,
      page_load: pageLoadTime,
      dom_ready: domReady,
      ttfb,
      memory_used: memoryUsed,
      memory_total: memoryTotal,
      dom_nodes: domNodes,
      network_type: networkType,
      rtt,
      overall_score: overallScore,
    });

    setLoading(false);
  }, [saveSnapshot]);

  useEffect(() => {
    collectMetrics();
    const interval = setInterval(collectMetrics, 30000); // every 30s (less aggressive for DB)
    return () => clearInterval(interval);
  }, [collectMetrics]);

  // Load DB history on mount and when period changes
  useEffect(() => {
    loadHistory(Number.parseInt(period));
  }, [loadHistory, period]);

  // Score = % de métricas boas. Métrica sem medição ('unknown') permanece na
  // conta e NÃO como "Bom": o ausente não infla o score para 100.
  const overallScore = Math.round((metrics.filter(m => m.status === 'good').length / Math.max(metrics.length, 1)) * 100);
  const unmeasuredCount = metrics.filter(m => m.status === 'unknown').length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'good': return <Badge className="bg-primary/10 text-primary border-primary/30 text-3xs">Bom</Badge>;
      case 'warning': return <Badge className="bg-warning/10 text-warning border-warning/30 text-3xs">Atenção</Badge>;
      case 'critical': return <Badge variant="destructive" className="text-3xs">Crítico</Badge>;
      case 'unknown': return <Badge variant="secondary" className="text-3xs">N/D</Badge>;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good': return 'text-primary';
      case 'warning': return 'text-warning';
      case 'critical': return 'text-destructive';
      default: return 'text-muted-foreground';
    }
  };

  // Format DB history for chart
  const dbChartData = dbHistory.map(s => ({
    time: new Date(s.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    fcp: s.fcp,
    page_load: s.page_load,
    memory: s.memory_used,
    score: s.overall_score,
  }));

  return (
    <div className="space-y-6 w-full min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Monitor de Performance</h2>
            <p className="text-sm text-muted-foreground">Métricas em tempo real + histórico persistido</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Última hora</SelectItem>
              <SelectItem value="6">6 horas</SelectItem>
              <SelectItem value="24">24 horas</SelectItem>
              <SelectItem value="72">3 dias</SelectItem>
              <SelectItem value="168">7 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => clearOldSnapshots()} className="h-8 text-xs">
            <Trash2 className="w-3 h-3 mr-1" />
            Limpar antigos
          </Button>
          <Button variant="outline" size="sm" onClick={collectMetrics} disabled={loading} className="h-8 text-xs">
            <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Overall Score */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-6">
            <div className="relative">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={overallScore >= 80 ? 'hsl(var(--primary))' : overallScore >= 50 ? 'hsl(40, 100%, 50%)' : 'hsl(var(--destructive))'} strokeWidth="3" strokeDasharray={`${overallScore}, 100`} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold" data-testid="overall-score">{overallScore}</span>
              </div>
            </div>
            <div>
              <p className="text-lg font-semibold">Score de Performance</p>
              <p className="text-sm text-muted-foreground">
                {overallScore >= 80 ? 'Excelente! Aplicação performando bem.' :
                 overallScore >= 50 ? 'Razoável. Há oportunidades de otimização.' :
                 'Atenção! Performance precisa de melhorias.'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                <Clock className="w-3 h-3 inline mr-1" />
                {dbHistory.length} snapshots no período selecionado
              </p>
              {unmeasuredCount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {unmeasuredCount} métrica{unmeasuredCount === 1 ? '' : 's'} sem medição neste navegador
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <Card key={metric.name}>
            <CardContent className="pt-4 pb-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground truncate">{metric.name}</p>
                  {getStatusBadge(metric.status)}
                </div>
                <p className={`text-xl font-bold ${getStatusColor(metric.status)}`}>
                  {metric.value ?? '—'}
                  <span className="text-xs text-muted-foreground ml-1">{metric.unit}</span>
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Persistent History Chart (from DB) */}
      {dbChartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-5 h-5" />
              Histórico Persistido
              <Badge variant="secondary" className="text-3xs ml-auto">{dbChartData.length} pontos</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={dbChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                <XAxis dataKey="time" fontSize={10} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                <Area type="monotone" dataKey="score" name="Score (%)" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.1)" />
                <Area type="monotone" dataKey="fcp" name="FCP (ms)" stroke="hsl(var(--secondary))" fill="hsl(var(--secondary) / 0.1)" />
                <Area type="monotone" dataKey="memory" name="Memória (MB)" stroke="hsl(var(--accent-foreground))" fill="hsl(var(--accent-foreground) / 0.1)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Session History (in-memory) */}
      {localHistory.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="w-5 h-5" />
              Sessão Atual (tempo real)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={localHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                <XAxis dataKey="time" fontSize={10} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={10} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                <Area type="monotone" dataKey="fcp" name="FCP (ms)" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.1)" />
                <Area type="monotone" dataKey="memory" name="Memória (MB)" stroke="hsl(var(--secondary))" fill="hsl(var(--secondary) / 0.1)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Cache Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="w-5 h-5" />
            Cache Inteligente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{cacheStats.hits}</p>
              <p className="text-xs text-muted-foreground">Cache Hits</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-warning">{cacheStats.misses}</p>
              <p className="text-xs text-muted-foreground">Cache Misses</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{cacheStats.size}</p>
              <p className="text-xs text-muted-foreground">Entradas Cached</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
