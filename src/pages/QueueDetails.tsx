import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/auth/useAuth';
import { FloatingParticles } from '@/components/dashboard/FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, AlertCircle, Settings } from 'lucide-react';
import { QueueCharts } from '@/components/queues/QueueCharts';
import { EditQueueDialog, type QueueUpdates } from '@/components/queues/EditQueueDialog';
import { QueueService } from '@/services/queue.service';
import { toast } from 'sonner';
import { QueueMetricsCards } from './queue-details/QueueMetricsCards';
import { QueueContactsTable } from './queue-details/QueueContactsTable';
import { useQueueDetails } from '@/hooks/queues/useQueueDetails';

export default function QueueDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { queue, members, contacts, metrics, loading, error, refetch } = useQueueDetails(
    user ? id : undefined,
  );
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  useEffect(() => { if (!authLoading && !user) navigate('/auth'); }, [user, authLoading, navigate]);

  // R2-QUE-006: o botão "Configurar" anunciava a edição da fila sem executá-la.
  // A gravação usa o mesmo caminho de escrita (QueueService.updateQueue) do hook
  // useQueues e só anuncia sucesso depois que a escrita é confirmada.
  const handleUpdateQueue = async (queueId: string, updates: QueueUpdates) => {
    const { error: updateError } = await QueueService.updateQueue(queueId, updates);
    if (updateError) {
      toast.error('Não foi possível atualizar a fila.');
      throw updateError;
    }
    toast.success('Fila atualizada com sucesso.');
    refetch();
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background p-6 space-y-6"><AuroraBorealis /><FloatingParticles />
        <div className="flex items-center gap-4"><Skeleton className="h-10 w-10" /><Skeleton className="h-8 w-64" /></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}</div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!queue) {
    // R2-QUE-004: falha de leitura (rede/RLS) e id inexistente são estados distintos — antes
    // os dois caíam em "Fila não encontrada" e o usuário não tinha como tentar de novo.
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            {error ? 'Erro ao carregar a fila' : 'Fila não encontrada'}
          </h2>
          {error && (
            <p className="text-sm text-muted-foreground mb-4 max-w-sm">
              Não foi possível carregar os dados desta fila. Verifique sua conexão e tente novamente.
            </p>
          )}
          <div className="flex justify-center gap-2">
            {error && <Button variant="outline" onClick={refetch}>Tentar novamente</Button>}
            <Button onClick={() => navigate('/')}>Voltar</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AuroraBorealis /><FloatingParticles />
      <PageHeader title={queue.name} subtitle={queue.description || undefined} showBack onBack={() => navigate('/')}
        breadcrumbs={[{ label: 'Filas', onClick: () => navigate('/'), href: '/' }, { label: queue.name }]}
        actions={<Button variant="outline" size="sm" className="gap-2" onClick={() => setEditDialogOpen(true)}><Settings className="w-4 h-4" />Configurar</Button>}
      />
      <EditQueueDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        queue={queue}
        onSubmit={handleUpdateQueue}
      />
      <div className="p-6 space-y-6">
        {error && (
          <Card className="border-destructive/40 bg-destructive/10" role="alert">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
                <div>
                  <p className="font-medium text-foreground">Erro ao carregar dados da fila</p>
                  <p className="text-sm text-muted-foreground">Algumas informações podem estar incompletas. Tente novamente para atualizar a tela.</p>
                </div>
              </div>
              <Button variant="outline" onClick={refetch}>Tentar novamente</Button>
            </CardContent>
          </Card>
        )}
        {metrics && <QueueMetricsCards metrics={metrics} />}
        {queue && <QueueCharts queueId={queue.id} queueColor={queue.color} />}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="border border-secondary/20 bg-card/50 backdrop-blur">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Users className="w-5 h-5" />Equipe ({members.length})</CardTitle></CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                <div className="space-y-3">
                  {members.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">Nenhum atendente nesta fila</p> :
                    members.map((member) => (
                      <div key={member.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/20 transition-colors">
                        <Avatar className="w-10 h-10"><AvatarImage src={member.profile?.avatar_url || undefined} /><AvatarFallback className="bg-primary/10 text-primary">{member.profile?.name?.[0] || '?'}</AvatarFallback></Avatar>
                        <div className="flex-1 min-w-0"><p className="font-medium text-foreground truncate">{member.profile?.name}</p><p className="text-xs text-muted-foreground">{member.profile?.is_active ? 'Ativo' : 'Inativo'}</p></div>
                        <Badge variant="secondary" className={member.profile?.is_active ? 'bg-success/10 text-success' : 'bg-muted/30'}>{member.profile?.is_active ? 'Online' : 'Offline'}</Badge>
                      </div>
                    ))
                  }
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
          <QueueContactsTable contacts={contacts} />
        </div>
      </div>
    </div>
  );
}
