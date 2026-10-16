import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { FloatingParticles } from '@/components/dashboard/FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Clock, BarChart3, AlertTriangle } from 'lucide-react';
import { useQueues, QueueWithMembers } from '@/hooks/business/useQueues';
import {
  useQueueGoals,
  useQueueGoalMetrics,
  QUEUE_GOAL_METRICS,
  goalMetricPercent,
  worstCrossedGoalBand,
  formatGoalMetricValue,
  QueueAlert,
  type QueueGoalMetricDefinition,
} from '@/hooks/business/useQueueGoals';
import { CreateQueueDialog } from './CreateQueueDialog';
import { EditQueueDialog } from './EditQueueDialog';
import { AddMemberDialog } from './AddMemberDialog';
import { QueueGoalsDialog } from './QueueGoalsDialog';
import { QueueAlertsDisplay } from './QueueAlertsDisplay';
import { QueueCard } from './QueueCard';

/**
 * Texto do alerta por métrica. O valor é sempre o que a RPC mediu (`waiting_contacts`,
 * `avg_wait_minutes`, `messages_pending`, `assignment_rate`) — nenhuma conta montada aqui.
 */
function queueAlertMessage(def: QueueGoalMetricDefinition, value: number, target: number): string {
  switch (def.key) {
    case 'waiting_contacts':
      return `${formatGoalMetricValue(value)} contatos aguardando atendimento`;
    case 'avg_wait_minutes':
      return `Espera média de ${formatGoalMetricValue(value)} min (limite ${formatGoalMetricValue(target)} min)`;
    case 'messages_pending':
      return `${formatGoalMetricValue(value)} mensagens sem resposta (limite ${formatGoalMetricValue(target)})`;
    case 'assignment_rate':
      return `Taxa de atribuição em ${formatGoalMetricValue(value)}% (mínimo ${formatGoalMetricValue(target)}%)`;
  }
}

export function QueuesView() {
  const navigate = useNavigate();
  const { queues, loading, createQueue, updateQueue, deleteQueue, addMember, removeMember } = useQueues();
  const { goals } = useQueueGoals();
  const { metrics } = useQueueGoalMetrics();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [goalsDialogOpen, setGoalsDialogOpen] = useState(false);
  const [selectedQueue, setSelectedQueue] = useState<QueueWithMembers | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [queueToDelete, setQueueToDelete] = useState<QueueWithMembers | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const alerts = useMemo<QueueAlert[]>(() => {
    const allAlerts: QueueAlert[] = [];
    queues.forEach(queue => {
      const queueGoal = goals[queue.id];
      // Sem meta cadastrada (ou com alertas desligados) não há alerta.
      if (!queueGoal || !queueGoal.alerts_enabled) return;
      // Sem métrica da RPC não há alerta: ou a fila está fora da visibilidade do usuário (a RPC só
      // devolve fila de membro para quem não é staff) ou a medição ainda não chegou. A conta antiga
      // (`membros ativos / (membros ativos + aguardando)`) era inventada no front.
      const metric = metrics[queue.id];
      if (!metric) return;

      QUEUE_GOAL_METRICS.forEach(def => {
        const bruto = metric[def.key];
        // `null` = não medido (sem base no período): não avisa. `0` = dado medido (fila vazia).
        if (bruto === null || bruto === undefined) return;
        const value = Number(bruto);
        if (!Number.isFinite(value)) return;

        const target = Number(queueGoal[def.goalKey]);
        const percent = goalMetricPercent(value, target);
        // Meta zerada não define percentual — sem faixa, sem alerta.
        if (percent === null) return;
        const band = worstCrossedGoalBand(percent, def.direction);
        if (band === null) return;

        const alertKey = `${queue.id}-${def.alertType}`;
        if (dismissedAlerts.has(alertKey)) return;

        allAlerts.push({
          type: def.alertType,
          queueId: queue.id,
          queueName: metric.queue_name || queue.name,
          queueColor: queue.color,
          message: queueAlertMessage(def, value, target),
          severity: def.direction === 'max'
            ? (band >= 100 ? 'critical' : 'warning')
            : (band <= 25 ? 'critical' : 'warning'),
          currentValue: value,
          threshold: target,
        });
      });
    });
    return allAlerts;
  }, [queues, goals, metrics, dismissedAlerts]);

  const getQueueAlertCount = (queueId: string) => alerts.filter(a => a.queueId === queueId).length;

  if (loading) {
    return (
      <div className="space-y-6 relative bg-background w-full min-w-0"><AuroraBorealis /><FloatingParticles />
        <div className="flex items-center justify-between"><div><Skeleton className="h-8 w-64 mb-2" /><Skeleton className="h-4 w-96" /></div><Skeleton className="h-10 w-32" /></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{[1,2,3].map(i => <Card key={i} className="border border-secondary/20 bg-card"><CardContent className="space-y-4 p-6"><Skeleton className="h-20 w-full" /><Skeleton className="h-12 w-full" /></CardContent></Card>)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative bg-background w-full min-w-0">
      <AuroraBorealis /><FloatingParticles />
      <PageHeader title="Filas de Atendimento" subtitle="Organize e distribua os atendimentos por departamento"
        breadcrumbs={[{ label: 'Gestão' }, { label: 'Filas' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" className="border-border/30 hover:bg-muted/30" onClick={() => navigate('/sla')}><Clock className="w-4 h-4 mr-2" />Dashboard SLA</Button>
            <Button variant="outline" className="border-border/30 hover:bg-muted/30" onClick={() => navigate('/queues/comparison')}><BarChart3 className="w-4 h-4 mr-2" />Comparar Filas</Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={() => setCreateDialogOpen(true)}><Plus className="w-4 h-4 mr-2" />Nova Fila</Button>
          </div>
        }
      />

      {alerts.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Alertas Ativos ({alerts.length})</h2>
          <QueueAlertsDisplay alerts={alerts} onDismiss={(a) => setDismissedAlerts(prev => new Set([...prev, `${a.queueId}-${a.type}`]))} onNavigate={(queueId) => navigate(`/queue/${queueId}`)} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {queues.map((queue) => (
          <QueueCard key={queue.id} queue={queue} alertCount={getQueueAlertCount(queue.id)}
            onAddMember={(q) => { setSelectedQueue(q); setAddMemberDialogOpen(true); }}
            onRemoveMember={(queueId, profileId) => removeMember(queueId, profileId)}
            onSetGoals={(q) => { setSelectedQueue(q); setGoalsDialogOpen(true); }}
            onEdit={(q) => { setSelectedQueue(q); setEditDialogOpen(true); }}
            onDelete={(q) => { setQueueToDelete(q); setDeleteDialogOpen(true); }}
          />
        ))}
        <Card className="border border-dashed border-border/40 cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors bg-transparent" onClick={() => setCreateDialogOpen(true)}>
          <CardContent className="flex flex-col items-center justify-center h-full min-h-[280px] text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mb-3"><Plus className="w-6 h-6" /></div>
            <p className="font-medium">Adicionar Nova Fila</p><p className="text-sm">Clique para criar</p>
          </CardContent>
        </Card>
      </div>

      <CreateQueueDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} onSubmit={createQueue} />
      {selectedQueue && <EditQueueDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} queue={selectedQueue} onSubmit={(id, updates) => updateQueue(id, updates)} />}
      {selectedQueue && <AddMemberDialog open={addMemberDialogOpen} onOpenChange={setAddMemberDialogOpen} queueId={selectedQueue.id} existingMemberIds={selectedQueue.members.map(m => m.profile_id)} onAddMember={(profileId) => addMember(selectedQueue.id, profileId)} />}
      {selectedQueue && <QueueGoalsDialog open={goalsDialogOpen} onOpenChange={setGoalsDialogOpen} queueId={selectedQueue.id} queueName={selectedQueue.name} queueColor={selectedQueue.color} />}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border/30">
          <AlertDialogHeader><AlertDialogTitle className="text-foreground">Excluir Fila</AlertDialogTitle><AlertDialogDescription>Tem certeza que deseja excluir a fila "{queueToDelete?.name}"? Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-muted-foreground">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (queueToDelete) { void deleteQueue(queueToDelete.id); setQueueToDelete(null); setDeleteDialogOpen(false); } }} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
