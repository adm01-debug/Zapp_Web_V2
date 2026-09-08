import { motion } from 'framer-motion';
import {
  AlertTriangle, TrendingDown, TrendingUp, Users, BarChart3,
  Activity, Eye, Mail, Bell, ChevronRight, User, Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getSentimentColor, getSentimentBg } from './useSentimentData';

interface Alert {
  id: string;
  contact_name?: string;
  sentiment_score?: number;
  consecutive_low?: number;
  createdAt: string;
  email_sent?: boolean;
  message?: string;
  agent_name?: string;
}

interface AgentData {
  agent: { id: string; name: string; avatar_url: string | null };
  avgScore: number;
  totalAnalyses: number;
  trend: number;
  positive: number;
  neutral: number;
  negative: number;
}

interface DailyData {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
}

interface Analysis {
  sentiment_score?: number;
}

// Overview Tab
export function OverviewTab({ dailyData, alerts, onViewAllAlerts }: {
  dailyData: DailyData[];
  alerts: Alert[];
  onViewAllAlerts: () => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Evolução Diária</CardTitle>
          <CardDescription>Sentimento por dia no período</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-end justify-between gap-1">
            {dailyData.map((day, i) => {
              const total = Math.max(day.positive + day.neutral + day.negative, 1);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col gap-[2px]" style={{ height: '160px' }}>
                    <div className="w-full bg-success/60 rounded-t transition-all" style={{ height: `${(day.positive / total) * 100}%` }} />
                    <div className="w-full bg-muted-foreground/40 transition-all" style={{ height: `${(day.neutral / total) * 100}%` }} />
                    <div className="w-full bg-destructive/60 rounded-b transition-all" style={{ height: `${(day.negative / total) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{day.date}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-6 mt-4 text-xs">
            <div className="flex items-center gap-2"><div className="h-3 w-3 rounded bg-success/60" /><span className="text-muted-foreground">Positivo</span></div>
            <div className="flex items-center gap-2"><div className="h-3 w-3 rounded bg-muted-foreground/40" /><span className="text-muted-foreground">Neutro</span></div>
            <div className="flex items-center gap-2"><div className="h-3 w-3 rounded bg-destructive/60" /><span className="text-muted-foreground">Negativo</span></div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div><CardTitle className="text-lg">Alertas Recentes</CardTitle><CardDescription>Últimos alertas disparados</CardDescription></div>
          <Button variant="ghost" size="sm" onClick={onViewAllAlerts}>Ver todos<ChevronRight className="h-4 w-4 ml-1" /></Button>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-48">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground"><Bell className="h-8 w-8 mb-2 opacity-50" /><p className="text-sm">Nenhum alerta no período</p></div>
            ) : (
              <div className="space-y-3">
                {alerts.slice(0, 5).map((alert) => (
                  <div key={alert.id} className="flex items-start gap-3 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="h-8 w-8 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0"><AlertTriangle className="h-4 w-4 text-destructive" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{alert.contact_name || 'Cliente'}</p>
                      <p className="text-xs text-muted-foreground">Sentimento: <span className="text-destructive">{alert.sentiment_score}%</span>{alert.consecutive_low && ` (${alert.consecutive_low}x consecutivas)`}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] text-muted-foreground">{format(new Date(alert.createdAt), 'dd/MM HH:mm')}</span>
                      {alert.email_sent && <Badge variant="outline" className="text-[10px] gap-1 py-0"><Mail className="h-3 w-3" />Enviado</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// Agents Tab
export function AgentsTab({ agentData }: { agentData: AgentData[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-lg">Ranking de Sentimento por Agente</CardTitle><CardDescription>Média de sentimento dos atendimentos</CardDescription></CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            {agentData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground"><Users className="h-12 w-12 mb-4 opacity-30" /><p>Nenhuma análise no período</p></div>
            ) : (
              <div className="space-y-4">
                {agentData.map((data, index) => (
                  <motion.div key={data.agent.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-1 w-6 text-sm font-bold text-muted-foreground">#{index + 1}</div>
                    <Avatar className="h-10 w-10"><AvatarImage src={data.agent.avatar_url || undefined} alt={data.agent.name || 'Agente'} /><AvatarFallback>{data.agent.name.substring(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{data.agent.name}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{data.totalAnalyses} análises</span>
                        <span className="flex items-center gap-1">
                          {data.trend > 0 ? <><TrendingUp className="h-3 w-3 text-success" /><span className="text-success">+{data.trend}%</span></> :
                           data.trend < 0 ? <><TrendingDown className="h-3 w-3 text-destructive" /><span className="text-destructive">{data.trend}%</span></> :
                           <span>Estável</span>}
                        </span>
                      </div>
                    </div>
                    <div className="text-right"><p className={`text-xl font-bold ${getSentimentColor(data.avgScore)}`}>{data.avgScore}%</p></div>
                  </motion.div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-lg">Distribuição por Agente</CardTitle><CardDescription>Comparativo de sentimento entre agentes</CardDescription></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {agentData.slice(0, 8).map((data) => {
              const total = data.positive + data.neutral + data.negative;
              return (
                <div key={data.agent.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6"><AvatarImage src={data.agent.avatar_url || undefined} alt={data.agent.name || 'Agente'} /><AvatarFallback className="text-[10px]">{data.agent.name.substring(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                      <span className="text-sm font-medium truncate max-w-[120px]">{data.agent.name}</span>
                    </div>
                    <span className={`text-sm font-bold ${getSentimentColor(data.avgScore)}`}>{data.avgScore}%</span>
                  </div>
                  <div className="h-4 flex rounded-full overflow-hidden bg-muted">
                    <div className="bg-success transition-all" style={{ width: `${(data.positive / Math.max(total, 1)) * 100}%` }} />
                    <div className="bg-muted-foreground/50 transition-all" style={{ width: `${(data.neutral / Math.max(total, 1)) * 100}%` }} />
                    <div className="bg-destructive transition-all" style={{ width: `${(data.negative / Math.max(total, 1)) * 100}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="text-success">{data.positive} positivas</span><span>{data.neutral} neutras</span><span className="text-destructive">{data.negative} negativas</span>
                  </div>
                </div>
              );
            })}
            {agentData.length === 0 && <div className="flex flex-col items-center justify-center h-64 text-muted-foreground"><BarChart3 className="h-12 w-12 mb-4 opacity-30" /><p>Nenhum dado para exibir</p></div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Alerts Tab
export function AlertsTab({ alerts }: { alerts: Alert[] }) {
  return (
    <Card className="border-border/50">
      <CardHeader><CardTitle className="text-lg">Histórico de Alertas</CardTitle><CardDescription>Todos os alertas de sentimento negativo</CardDescription></CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mb-4 opacity-30" /><p>Nenhum alerta registrado no período</p><p className="text-sm">Os alertas aparecem quando o sentimento cai abaixo de 30%</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <motion.div key={alert.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-4 p-4 rounded-lg border border-border/50 bg-card hover:bg-muted/30 transition-colors">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${(alert.sentiment_score || 50) < 20 ? 'bg-destructive/30' : 'bg-warning/20'}`}>
                    <AlertTriangle className={`h-5 w-5 ${(alert.sentiment_score || 50) < 20 ? 'text-destructive' : 'text-warning'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{alert.contact_name || 'Cliente'}</h4>
                      {(alert.sentiment_score || 50) < 20 && <Badge variant="destructive" className="text-[10px]">Crítico</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(new Date(alert.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                      {alert.agent_name && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{alert.agent_name}</span>}
                      {alert.email_sent && <span className="flex items-center gap-1 text-success"><Mail className="h-3 w-3" />Email enviado</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${getSentimentColor(alert.sentiment_score || 50)}`}>{alert.sentiment_score || 50}%</div>
                    <p className="text-xs text-muted-foreground">{alert.consecutive_low}x consecutivas</p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Distribution Tab
export function DistributionTab({ stats, analyses }: {
  stats: { totalAnalyses: number; positiveAnalyses: number; neutralAnalyses: number; negativeAnalyses: number };
  analyses: Analysis[];
}) {
  const ranges = [
    { label: '0-20%', min: 0, max: 20, color: 'bg-destructive' },
    { label: '21-40%', min: 21, max: 40, color: 'bg-warning' },
    { label: '41-60%', min: 41, max: 60, color: 'bg-warning' },
    { label: '61-80%', min: 61, max: 80, color: 'bg-success/70' },
    { label: '81-100%', min: 81, max: 100, color: 'bg-success' },
  ];
  const maxCount = Math.max(...ranges.map(r => analyses.filter(a => (a.sentiment_score || 50) >= r.min && (a.sentiment_score || 50) <= r.max).length), 1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-lg">Distribuição de Sentimento</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { label: 'Positivo', icon: TrendingUp, color: 'text-success', bgColor: 'bg-success', count: stats.positiveAnalyses },
              { label: 'Neutro', icon: Activity, color: 'text-muted-foreground', bgColor: 'bg-muted-foreground', count: stats.neutralAnalyses },
              { label: 'Negativo', icon: TrendingDown, color: 'text-destructive', bgColor: 'bg-destructive', count: stats.negativeAnalyses },
            ].map(item => (
              <div key={item.label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-2"><item.icon className={`h-4 w-4 ${item.color}`} />{item.label}</span>
                  <span className="font-medium">{item.count}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${item.bgColor} transition-all`} style={{ width: `${(item.count / Math.max(stats.totalAnalyses, 1)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground text-center">Total: <span className="font-medium text-foreground">{stats.totalAnalyses}</span> análises</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 lg:col-span-2">
        <CardHeader><CardTitle className="text-lg">Distribuição por Score</CardTitle><CardDescription>Faixas de pontuação de sentimento</CardDescription></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {ranges.map((range) => {
              const count = analyses.filter(a => (a.sentiment_score || 50) >= range.min && (a.sentiment_score || 50) <= range.max).length;
              const percentage = (count / maxCount) * 100;
              return (
                <div key={range.label} className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground w-16">{range.label}</span>
                  <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                    <div className={`h-full ${range.color} transition-all flex items-center justify-end pr-2`} style={{ width: `${percentage}%` }}>
                      {count > 0 && <span className="text-xs font-medium text-primary-foreground">{count}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
