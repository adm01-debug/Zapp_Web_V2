import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Brain, TrendingUp, Users, Zap, Clock, Download, RefreshCw } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useAIUsageDashboard, FUNCTION_COLORS, FUNCTION_LABELS } from '@/hooks/analytics/useAIUsageDashboard';
import type { TimeFilter } from '@/hooks/analytics/useAIUsageDashboard';
import { AIUsageLogsTab } from './AIUsageLogsTab';
import { AIUsageUsersTab } from './AIUsageUsersTab';

export function AIUsageDashboard() {
  const {
    logs, isLoading, refetch, timeFilter, setTimeFilter,
    logsPage, setLogsPage, profileMap, stats,
    userUsage, functionUsage, timelineData, handleExportCSV,
  } = useAIUsageDashboard();

  const functionNames = Object.keys(FUNCTION_COLORS);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Brain className="w-6 h-6 text-primary" />Consumo de IA</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitoramento de uso das funções de inteligência artificial por usuário</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Última 1h</SelectItem><SelectItem value="6h">Últimas 6h</SelectItem>
              <SelectItem value="24h">Últimas 24h</SelectItem><SelectItem value="7d">Últimos 7 dias</SelectItem><SelectItem value="30d">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="w-4 h-4 mr-1" /> CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { icon: Zap, label: 'Chamadas', value: stats.totalCalls.toLocaleString() },
          { icon: TrendingUp, label: 'Tokens Total', value: stats.totalTokens.toLocaleString() },
          { icon: Users, label: 'Usuários Ativos', value: stats.uniqueUsers },
          { icon: Clock, label: 'Tempo Médio', value: `${stats.avgDuration}ms` },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label}><CardContent className="pt-4 pb-3"><div className="flex items-center gap-2 text-muted-foreground text-xs font-medium"><Icon className="w-3.5 h-3.5" /> {label}</div><p className="text-2xl font-bold text-foreground mt-1">{value}</p></CardContent></Card>
        ))}
        <Card><CardContent className="pt-4 pb-3"><div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">❌ Erros</div><p className="text-2xl font-bold text-foreground mt-1">{stats.errorCount}{stats.totalCalls > 0 && <span className="text-xs text-muted-foreground ml-1">({((stats.errorCount / stats.totalCalls) * 100).toFixed(1)}%)</span>}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="users">Por Usuário</TabsTrigger>
          <TabsTrigger value="logs">Logs Detalhados</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Chamadas ao Longo do Tempo</CardTitle></CardHeader>
              <CardContent>
                {timelineData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={timelineData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="time" fontSize={11} className="fill-muted-foreground" />
                      <YAxis fontSize={11} className="fill-muted-foreground" />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--popover-foreground))' }} />
                      {functionNames.map(fn => <Area key={fn} type="monotone" dataKey={fn} stackId="1" fill={FUNCTION_COLORS[fn]} stroke={FUNCTION_COLORS[fn]} fillOpacity={0.6} name={FUNCTION_LABELS[fn] || fn} />)}
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">Nenhum dado no período selecionado</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Distribuição por Função</CardTitle></CardHeader>
              <CardContent>
                {functionUsage.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart><Pie data={functionUsage} dataKey="tokens" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>{functionUsage.map((entry) => <Cell key={entry.name} fill={FUNCTION_COLORS[entry.name] || '#666'} />)}</Pie><Tooltip formatter={(v: any) => v.toLocaleString() + ' tokens'} /></PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5 mt-2">
                      {functionUsage.map(f => (
                        <div key={f.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: FUNCTION_COLORS[f.name] || '#666' }} /><span className="text-muted-foreground">{FUNCTION_LABELS[f.name] || f.name}</span></div>
                          <span className="font-medium text-foreground">{f.calls}x</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-4"><AIUsageUsersTab userUsage={userUsage} profileMap={profileMap} /></TabsContent>
        <TabsContent value="logs"><AIUsageLogsTab logs={logs} logsPage={logsPage} setLogsPage={setLogsPage} profileMap={profileMap} /></TabsContent>
      </Tabs>
    </div>
  );
}
