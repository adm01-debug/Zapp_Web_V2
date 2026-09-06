import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, CheckCircle2, XCircle, Loader2, History } from 'lucide-react';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  active: { label: 'Ativo', color: 'bg-info/20 text-info border-info/30', icon: Loader2 },
  completed: { label: 'Concluído', color: 'bg-success/20 text-success border-success/30', icon: CheckCircle2 },
  cancelled: { label: 'Cancelado', color: 'bg-destructive/20 text-destructive border-destructive/30', icon: XCircle },
  paused: { label: 'Pausado', color: 'bg-warning/20 text-warning border-warning/30', icon: Clock },
};

export function FollowUpExecutionsHistory() {
  const { data: executions = [], isLoading } = useQuery({
    queryKey: ['followup-executions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('followup_executions')
        .select('*, sequence:followup_sequences(name), contact:contacts(name, phone)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  if (executions.length === 0) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="py-0">
          <GenericEmptyState icon={History} title="Sem execuções" description="Nenhuma execução de follow-up registrada" className="py-8" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          Histórico de Execuções
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[400px]">
          <div className="divide-y divide-border/50">
            {executions.map((exec) => {
              const cfg = STATUS_MAP[exec.status] || STATUS_MAP.active;
              const Icon = cfg.icon;

              return (
                <div key={exec.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground truncate">
                        {exec.sequence?.name || 'Sequência removida'}
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
                        {cfg.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>{exec.contact?.name || exec.contact?.phone || '—'}</span>
                      <span>•</span>
                      <span>Etapa {exec.current_step}</span>
                      <span>•</span>
                      <span>{exec.created_at ? format(new Date(exec.created_at), "dd/MM HH:mm", { locale: ptBR }) : '—'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
