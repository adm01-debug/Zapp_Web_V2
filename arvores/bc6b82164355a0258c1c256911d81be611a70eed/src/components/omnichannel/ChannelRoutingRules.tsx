import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Route, Trash2, Plus, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

interface RoutingRule {
  id: string;
  channel_type: string;
  channel_connection_id: string | null;
  queue_id: string | null;
  priority: number | null;
  is_active: boolean | null;
  conditions: Record<string, unknown> | null;
  created_at: string;
  queue?: { name: string } | null;
  channel_connection?: { name: string } | null;
}

export function ChannelRoutingRules() {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newRule, setNewRule] = useState({ channel_type: 'whatsapp', queue_id: '', priority: 1 });

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['channel-routing-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channel_routing_rules')
        .select('*, queue:queues(name), channel_connection:channel_connections_safe(name)')
        .order('priority', { ascending: true });
      if (error) throw error;
      return (data || []) as RoutingRule[];
    },
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['queues-for-routing'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('queues')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('channel_routing_rules')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-routing-rules'] });
    },
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('channel_routing_rules')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-routing-rules'] });
      toast.success('Regra removida');
    },
  });

  const createRule = useMutation({
    mutationFn: async (rule: typeof newRule) => {
      const { error } = await supabase
        .from('channel_routing_rules')
        .insert({
          channel_type: rule.channel_type as Database["public"]["Enums"]["channel_type"],
          queue_id: rule.queue_id || null,
          priority: rule.priority,
          is_active: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-routing-rules'] });
      setAdding(false);
      setNewRule({ channel_type: 'whatsapp', queue_id: '', priority: 1 });
      toast.success('Regra criada');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const channelLabels: Record<string, string> = {
    whatsapp: 'WhatsApp',
    instagram: 'Instagram',
    telegram: 'Telegram',
    messenger: 'Messenger',
    webchat: 'Web Chat',
    email: 'Email',
  };

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Route className="w-5 h-5 text-primary" />
          Regras de Roteamento por Canal
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setAdding(!adding)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Nova Regra
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5">
            <Select value={newRule.channel_type} onValueChange={v => setNewRule(r => ({ ...r, channel_type: v }))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(channelLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={newRule.queue_id} onValueChange={v => setNewRule(r => ({ ...r, queue_id: v }))}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Selecione fila..." /></SelectTrigger>
              <SelectContent>
                {queues.map((q: { id: string; name: string }) => (
                  <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => createRule.mutate(newRule)} disabled={createRule.isPending}>
              Criar
            </Button>
          </div>
        )}

        {rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <AlertTriangle className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">Nenhuma regra de roteamento configurada</p>
            <p className="text-xs mt-1">Crie regras para direcionar mensagens de cada canal para filas específicas</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2">
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <Switch
                    checked={rule.is_active ?? true}
                    onCheckedChange={(checked) => toggleRule.mutate({ id: rule.id, is_active: checked })}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {channelLabels[rule.channel_type] || rule.channel_type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">→</span>
                      <span className="text-sm font-medium text-foreground">
                        {rule.queue?.name || 'Sem fila definida'}
                      </span>
                    </div>
                    {rule.channel_connection?.name && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Conexão: {rule.channel_connection.name}
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-3xs">
                    Prioridade {rule.priority ?? 0}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteRule.mutate(rule.id)}
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
