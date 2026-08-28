import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Settings2, Trash2, Clock, Mail, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ReportConfig {
  id: string;
  name: string;
  report_type: string;
  frequency: string;
  recipients: string[];
  is_active: boolean;
  last_sent_at: string | null;
  next_send_at: string | null;
  config: Record<string, unknown>;
  created_at: string;
}

const FREQ_LABELS: Record<string, string> = {
  daily: 'Diário',
  weekly: 'Semanal',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
};

const TYPE_LABELS: Record<string, string> = {
  conversations: 'Conversas',
  agents: 'Agentes',
  satisfaction: 'Satisfação',
  sla: 'SLA',
  general: 'Geral',
};

export function ScheduledReportConfigs() {
  const queryClient = useQueryClient();

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['scheduled-report-configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduled_report_configs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ReportConfig[];
    },
  });

  const toggleConfig = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('scheduled_report_configs')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-report-configs'] });
    },
  });

  const deleteConfig = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('scheduled_report_configs')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-report-configs'] });
      toast.success('Configuração removida');
    },
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-primary" />
          Configurações de Relatórios Agendados
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Gerencie os relatórios automáticos que são enviados periodicamente
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {configs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground px-4">
            <AlertTriangle className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">Nenhuma configuração de relatório agendado</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="divide-y divide-border/50">
              {configs.map((cfg) => (
                <div key={cfg.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <Switch
                    checked={cfg.is_active}
                    onCheckedChange={(checked) => toggleConfig.mutate({ id: cfg.id, is_active: checked })}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground truncate">{cfg.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {TYPE_LABELS[cfg.report_type] || cfg.report_type}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        <Clock className="w-2.5 h-2.5 mr-1" />
                        {FREQ_LABELS[cfg.frequency] || cfg.frequency}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {cfg.recipients?.length || 0} destinatário(s)
                      </span>
                      {cfg.last_sent_at && (
                        <>
                          <span>•</span>
                          <span>Último: {format(new Date(cfg.last_sent_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                        </>
                      )}
                      {cfg.next_send_at && (
                        <>
                          <span>•</span>
                          <span>Próximo: {format(new Date(cfg.next_send_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteConfig.mutate(cfg.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
