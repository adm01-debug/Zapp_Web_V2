import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { subDays } from 'date-fns';
import { FloatingParticles } from '@/components/dashboard/FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  Users,
  MessageSquare,
  TrendingUp,
  Clock,
  BarChart3,
  Eye,
} from 'lucide-react';
import { QueuesComparisonCharts } from './QueuesComparisonCharts';
import { useQueuesComparison } from '@/hooks/business/useQueuesComparison';
import { PeriodSelector, PeriodOption } from './PeriodSelector';

export function QueuesComparisonDashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodOption>('7d');
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const from = subDays(now, 6);
    return { from, to: now };
  });

  const { queuesPerformance, loading } = useQueuesComparison(dateRange);

  const handlePeriodChange = (newPeriod: PeriodOption, newRange: { from: Date; to: Date }) => {
    setPeriod(newPeriod);
    setDateRange(newRange);
  };

  // Prepare data for charts
  const barChartData = queuesPerformance.map(q => ({
    name: q.name.length > 12 ? q.name.substring(0, 12) + '...' : q.name,
    fullName: q.name,
    contatos: q.totalContacts,
    mensagens: q.totalMessages,
    atendentes: q.agentsCount,
    color: q.color,
  }));

  // Normalize data for radar chart (0-100 scale)
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

  // Calculate totals
  const totals = queuesPerformance.reduce(
    (acc, q) => ({
      contacts: acc.contacts + q.totalContacts,
      messages: acc.messages + q.totalMessages,
      agents: acc.agents + q.agentsCount,
      waiting: acc.waiting + q.waitingContacts,
    }),
    { contacts: 0, messages: 0, agents: 0, waiting: 0 }
  );

  if (loading) {
    return (
      <div className="p-6 space-y-6 overflow-y-auto h-full relative bg-background">
        <AuroraBorealis />
        <FloatingParticles />
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full relative bg-background">
      <AuroraBorealis />
      <FloatingParticles />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="hover:bg-muted/30"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="w-6 h-6" />
              Comparação de Filas
            </h1>
            <p className="text-muted-foreground">
              Análise comparativa de performance entre filas
            </p>
          </div>
        </div>
        <PeriodSelector
          value={period}
          dateRange={dateRange}
          onChange={handlePeriodChange}
        />
      </div>

      {queuesPerformance.length === 0 ? (
        <Card className="border border-secondary/20 bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BarChart3 className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-foreground">Nenhuma fila encontrada</p>
            <p className="text-muted-foreground">Crie filas para ver a comparação de performance</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border border-secondary/20 bg-card/50 backdrop-blur">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Contatos</p>
                    <p className="text-2xl font-bold text-foreground">{totals.contacts}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-secondary/20 bg-card/50 backdrop-blur">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Mensagens</p>
                    <p className="text-2xl font-bold text-foreground">{totals.messages}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-secondary/20 bg-card/50 backdrop-blur">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-secondary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Atendentes</p>
                    <p className="text-2xl font-bold text-foreground">{totals.agents}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-secondary/20 bg-card/50 backdrop-blur">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                    <Clock className="w-5 h-5 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Aguardando</p>
                    <p className="text-2xl font-bold text-foreground">{totals.waiting}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <QueuesComparisonCharts queuesPerformance={queuesPerformance} />

          {/* Detailed Table */}
          <Card className="border border-secondary/20 bg-card/50 backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                Detalhamento por Fila
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/20">
                      <TableHead>Fila</TableHead>
                      <TableHead className="text-right">Contatos</TableHead>
                      <TableHead className="text-right">Atribuídos</TableHead>
                      <TableHead className="text-right">Aguardando</TableHead>
                      <TableHead className="text-right">Mensagens</TableHead>
                      <TableHead className="text-right">Média/Contato</TableHead>
                      <TableHead className="text-right">Atendentes</TableHead>
                      <TableHead className="text-right">Taxa Atrib.</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queuesPerformance.map((queue) => {
                      const assignmentRate = queue.totalContacts > 0
                        ? Math.round((queue.assignedContacts / queue.totalContacts) * 100)
                        : 0;

                      return (
                        <TableRow key={queue.id} className="border-border/20 hover:bg-muted/10">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: queue.color }}
                              />
                              <span className="font-medium text-foreground">{queue.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">{queue.totalContacts}</TableCell>
                          <TableCell className="text-right text-success">{queue.assignedContacts}</TableCell>
                          <TableCell className="text-right text-accent-foreground">{queue.waitingContacts}</TableCell>
                          <TableCell className="text-right">{queue.totalMessages}</TableCell>
                          <TableCell className="text-right">{queue.avgMessagesPerContact}</TableCell>
                          <TableCell className="text-right">{queue.agentsCount}</TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant="secondary"
                              className={
                                assignmentRate >= 80
                                  ? 'bg-success/10 text-success'
                                  : assignmentRate >= 50
                                  ? 'bg-warning/10 text-warning'
                                  : 'bg-destructive/10 text-destructive'
                              }
                            >
                              {assignmentRate}%
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-8 h-8"
                              onClick={() => navigate(`/queue/${queue.id}`)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
