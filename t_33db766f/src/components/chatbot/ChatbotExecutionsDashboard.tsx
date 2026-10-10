import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Play, CheckCircle2, XCircle, Clock, AlertTriangle, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  running: { label: 'Em execução', color: 'bg-info/20 text-info border-info/30', icon: Play },
  completed: { label: 'Concluído', color: 'bg-success/20 text-success border-success/30', icon: CheckCircle2 },
  failed: { label: 'Falhou', color: 'bg-destructive/20 text-destructive border-destructive/30', icon: XCircle },
  waiting: { label: 'Aguardando', color: 'bg-warning/20 text-warning border-warning/30', icon: Clock },
};

export function ChatbotExecutionsDashboard() {
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: executions = [], isLoading } = useQuery({
    queryKey: ['chatbot-executions', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('chatbot_executions')
        .select('*, flow:chatbot_flows(name), contact:contacts(name, phone)')
        .order('created_at', { ascending: false })
        .limit(200);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const stats = {
    total: executions.length,
    running: executions.filter((e) => e.status === 'running').length,
    completed: executions.filter((e) => e.status === 'completed').length,
    failed: executions.filter((e) => e.status === 'failed').length,
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-info/20 flex items-center justify-center">
              <Play className="w-5 h-5 text-info" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.running}</p>
              <p className="text-xs text-muted-foreground">Em execução</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.completed}</p>
              <p className="text-xs text-muted-foreground">Concluídos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.failed}</p>
              <p className="text-xs text-muted-foreground">Falhas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter + List */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Execuções do Chatbot</CardTitle>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="running">Em execução</SelectItem>
              <SelectItem value="completed">Concluídos</SelectItem>
              <SelectItem value="failed">Falhas</SelectItem>
              <SelectItem value="waiting">Aguardando</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            {executions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <AlertTriangle className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">Nenhuma execução encontrada</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {executions.map((exec) => {
                  const cfg = STATUS_CONFIG[exec.status] || STATUS_CONFIG.waiting;
                  const Icon = cfg.icon;
                  const duration = exec.completed_at && exec.started_at
                    ? Math.round((new Date(exec.completed_at).getTime() - new Date(exec.started_at).getTime()) / 1000)
                    : null;

                  return (
                    <div key={exec.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-foreground truncate">
                            {exec.flow?.name || 'Fluxo removido'}
                          </span>
                          <Badge variant="outline" className={`text-3xs ${cfg.color}`}>
                            {cfg.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>{exec.contact?.name || exec.contact?.phone || 'Contato desconhecido'}</span>
                          <span>•</span>
                          <span>{format(new Date(exec.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                          {duration !== null && (
                            <>
                              <span>•</span>
                              <span>{duration}s</span>
                            </>
                          )}
                        </div>
                        {exec.error_message && (
                          <p className="text-xs text-destructive mt-1 truncate">{exec.error_message}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
