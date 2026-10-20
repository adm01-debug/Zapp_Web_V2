import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, TrendingDown, Activity, RefreshCw, Calendar, User, ShieldAlert, BarChart3, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSentimentData, getSentimentColor, getSentimentBg } from './useSentimentData';
import { OverviewTab, AgentsTab, AlertsTab, DistributionTab } from './SentimentTabContent';

export function SentimentAlertsDashboard() {
  const [period, setPeriod] = useState('7');
  const [activeTab, setActiveTab] = useState('overview');
  const { alerts, analyses, loading, stats, dailyData, agentData, fetchData } = useSentimentData(period);

  return (
    <div className="space-y-6 w-full min-w-0">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Alertas de Sentimento</h1><p className="text-muted-foreground">Monitore o sentimento dos clientes e alertas automáticos</p></div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2 opacity-50 cursor-not-allowed" disabled><ShieldAlert className="h-4 w-4 text-destructive" />Exportação Bloqueada</Button>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40"><Calendar className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem><SelectItem value="14">Últimos 14 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem><SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Total de Alertas', value: stats.totalAlerts, icon: AlertTriangle, iconBg: 'bg-destructive/20', iconColor: 'text-destructive', sub: <><span className="text-destructive">{stats.criticalAlerts} críticos</span><span>•</span><span>{stats.emailsSent} emails enviados</span></> },
          { title: 'Sentimento Médio', value: <span className={getSentimentColor(stats.avgSentiment)}>{stats.avgSentiment}%</span>, icon: Activity, iconBg: 'bg-primary/20', iconColor: 'text-primary', sub: <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden"><div className={`h-full transition-all ${getSentimentBg(stats.avgSentiment)}`} style={{ width: `${stats.avgSentiment}%` }} /></div> },
          { title: 'Taxa de Negativos', value: <span className={stats.negativeRate > 30 ? 'text-destructive' : 'text-success'}>{stats.negativeRate}%</span>, icon: TrendingDown, iconBg: 'bg-warning/20', iconColor: 'text-warning', sub: <>{stats.negativeAnalyses} de {stats.totalAnalyses} análises</> },
          { title: 'Clientes Afetados', value: stats.uniqueContacts, icon: Users, iconBg: 'bg-info/20', iconColor: 'text-info', sub: <>Com alertas de sentimento</> },
        ].map((stat, i) => (
          <motion.div key={stat.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card className="border-border/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm text-muted-foreground">{stat.title}</p><p className="text-3xl font-bold">{stat.value}</p></div>
                  <div className={`h-12 w-12 rounded-full ${stat.iconBg} flex items-center justify-center`}><stat.icon className={`h-6 w-6 ${stat.iconColor}`} /></div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">{stat.sub}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-2"><BarChart3 className="h-4 w-4" />Visão Geral</TabsTrigger>
          <TabsTrigger value="agents" className="gap-2"><User className="h-4 w-4" />Por Agente</TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2"><AlertTriangle className="h-4 w-4" />Alertas ({alerts.length})</TabsTrigger>
          <TabsTrigger value="distribution" className="gap-2"><Activity className="h-4 w-4" />Distribuição</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-6"><OverviewTab dailyData={dailyData} alerts={alerts} onViewAllAlerts={() => setActiveTab('alerts')} /></TabsContent>
        <TabsContent value="agents" className="mt-6"><AgentsTab agentData={agentData} /></TabsContent>
        <TabsContent value="alerts" className="mt-6"><AlertsTab alerts={alerts} /></TabsContent>
        <TabsContent value="distribution" className="mt-6"><DistributionTab stats={stats} analyses={analyses} /></TabsContent>
      </Tabs>
    </div>
  );
}
