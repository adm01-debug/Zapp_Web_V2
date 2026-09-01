import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, Legend,
} from 'recharts';
import { BarChart3, TrendingUp } from 'lucide-react';

interface QueuePerf {
  id: string;
  name: string;
  color: string;
  totalContacts: number;
  totalMessages: number;
  agentsCount: number;
  avgMessagesPerContact: number;
  assignedContacts: number;
}

interface QueuesComparisonChartsProps {
  queuesPerformance: QueuePerf[];
}

export function QueuesComparisonCharts({ queuesPerformance }: QueuesComparisonChartsProps) {
  const barChartData = queuesPerformance.map(q => ({
    name: q.name.length > 12 ? q.name.substring(0, 12) + '...' : q.name,
    fullName: q.name,
    contatos: q.totalContacts,
    mensagens: q.totalMessages,
    atendentes: q.agentsCount,
    color: q.color,
  }));

  const maxContacts = Math.max(...queuesPerformance.map(q => q.totalContacts), 1);
  const maxMessages = Math.max(...queuesPerformance.map(q => q.totalMessages), 1);
  const maxAgents = Math.max(...queuesPerformance.map(q => q.agentsCount), 1);
  const maxAvgMessages = Math.max(...queuesPerformance.map(q => q.avgMessagesPerContact), 1);

  const radarData = [
    { metric: 'Contatos', ...Object.fromEntries(queuesPerformance.map(q => [q.name, Math.round((q.totalContacts / maxContacts) * 100)])) },
    { metric: 'Mensagens', ...Object.fromEntries(queuesPerformance.map(q => [q.name, Math.round((q.totalMessages / maxMessages) * 100)])) },
    { metric: 'Atendentes', ...Object.fromEntries(queuesPerformance.map(q => [q.name, Math.round((q.agentsCount / maxAgents) * 100)])) },
    { metric: 'Média Msgs', ...Object.fromEntries(queuesPerformance.map(q => [q.name, Math.round((q.avgMessagesPerContact / maxAvgMessages) * 100)])) },
    { metric: 'Atribuídos', ...Object.fromEntries(queuesPerformance.map(q => [q.name, q.totalContacts > 0 ? Math.round((q.assignedContacts / q.totalContacts) * 100) : 0])) },
  ];

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    color: 'hsl(var(--foreground))',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border border-secondary/20 bg-card/50 backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Contatos e Mensagens por Fila
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={barChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(value, payload) => payload?.[0]?.payload?.fullName || value} />
                <Legend />
                <Bar dataKey="contatos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Contatos" />
                <Bar dataKey="mensagens" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} name="Mensagens" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-secondary/20 bg-card/50 backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Comparação de Performance (%)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="metric" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                {queuesPerformance.slice(0, 4).map((queue) => (
                  <Radar key={queue.id} name={queue.name} dataKey={queue.name} stroke={queue.color} fill={queue.color} fillOpacity={0.2} />
                ))}
                <Legend />
                <Tooltip contentStyle={tooltipStyle} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
