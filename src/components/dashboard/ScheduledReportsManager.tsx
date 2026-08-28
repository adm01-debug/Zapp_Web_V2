/**
 * ScheduledReportsManager — dashboard/ version
 *
 * PURPOSE: Lightweight Card widget for embedding inside the Dashboard page.
 * Manages scheduled report configs inline using direct Supabase mutations
 * (no custom hook abstraction). Designed to be dropped anywhere a Card
 * fits without additional context.
 *
 * KEY DIFFERENCES from reports/ScheduledReportsManager:
 *  - Self-contained state: formName, formType, formFrequency, formRecipients
 *  - Direct useQuery + useMutation wired to Supabase (no custom hook)
 *  - Recipients: plain-text comma-separated Input  ← simple UX
 *  - Actions: create + toggle active + delete  (NO edit, NO send-now)
 *  - No format field (pdf/csv/etc.)
 *  - No next_send_at display
 *  - No framer-motion (no AnimatePresence on card list)
 *  - Renders as a single <Card> with an inline Dialog
 *  - Does NOT include <ScheduledReportConfigs />
 *
 * DO NOT merge with reports/ScheduledReportsManager — that file uses the
 * useScheduledReports() hook, supports edit + send-now + format selector,
 * manages recipients as chips, includes AnimatePresence animations and
 * composes <ScheduledReportConfigs /> below the list.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Calendar, Clock, FileText, Mail, Plus, Trash2, Edit2, PlayCircle, PauseCircle, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/auth/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Diário',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
};

const REPORT_TYPE_LABELS: Record<string, string> = {
  performance: 'Performance',
  satisfaction: 'Satisfação',
  sla: 'Métricas SLA',
  conversations: 'Conversas',
  agents: 'Agentes',
  full: 'Completo',
};

export function ScheduledReportsManager() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('performance');
  const [formFrequency, setFormFrequency] = useState('weekly');
  const [formRecipients, setFormRecipients] = useState('');

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['scheduled-report-configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scheduled_report_configs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const createConfig = useMutation({
    mutationFn: async () => {
      const recipients = formRecipients.split(',').map(r => r.trim()).filter(Boolean);
      const { error } = await supabase.from('scheduled_report_configs').insert({
        name: formName,
        report_type: formType,
        frequency: formFrequency,
        recipients,
        created_by: profile?.id,
        is_active: true,
        config: {},
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-report-configs'] });
      toast.success('Relatório agendado criado!');
      setShowCreate(false);
      resetForm();
    },
    onError: () => toast.error('Erro ao criar relatório'),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from('scheduled_report_configs').update({ is_active: !isActive }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-report-configs'] });
      toast.success('Status atualizado');
    },
  });

  const deleteConfig = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('scheduled_report_configs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-report-configs'] });
      toast.success('Relatório removido');
    },
  });

  const resetForm = () => {
    setFormName('');
    setFormType('performance');
    setFormFrequency('weekly');
    setFormRecipients('');
  };

  if (isLoading) {
    return (
      <Card className="border border-border/60">
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border border-border/60 bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Relatórios Agendados
              </CardTitle>
              <CardDescription>
                Configure relatórios automáticos enviados por email
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Novo Relatório
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {configs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">Nenhum relatório agendado</p>
              <p className="text-xs mt-1">Crie relatórios automáticos para receber por email</p>
            </div>
          ) : (
            <div className="space-y-3">
              {configs.map((config) => (
                <div
                  key={config.id}
                  className={cn(
                    'flex items-center justify-between p-4 rounded-xl border transition-all',
                    config.is_active
                      ? 'border-border/60 bg-card hover:border-primary/30'
                      : 'border-border/30 bg-muted/30 opacity-60'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                      config.is_active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    )}>
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{config.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px] px-1.5">
                          {REPORT_TYPE_LABELS[config.report_type] || config.report_type}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] px-1.5">
                          <Clock className="w-3 h-3 mr-1" />
                          {FREQUENCY_LABELS[config.frequency] || config.frequency}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {config.recipients?.length || 0} destinatários
                        </span>
                      </div>
                      {config.last_sent_at && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Último envio: {formatDistanceToNow(new Date(config.last_sent_at), { locale: ptBR, addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <Switch
                      checked={config.is_active}
                      onCheckedChange={() => toggleActive.mutate({ id: config.id, isActive: config.is_active })}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteConfig.mutate(config.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Relatório Agendado</DialogTitle>
            <DialogDescription>Configure um relatório para envio automático</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome do relatório</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ex: Relatório semanal de performance" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(REPORT_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Frequência</Label>
                <Select value={formFrequency} onValueChange={setFormFrequency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQUENCY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Destinatários (emails separados por vírgula)</Label>
              <Input value={formRecipients} onChange={(e) => setFormRecipients(e.target.value)} placeholder="email1@empresa.com, email2@empresa.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={() => createConfig.mutate()} disabled={!formName || !formRecipients || createConfig.isPending}>
              {createConfig.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Criar Relatório
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
