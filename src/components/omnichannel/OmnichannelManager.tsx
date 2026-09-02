import { useState, lazy, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { 
  MessageSquare, Plus, Settings, Trash2, CheckCircle, XCircle, 
  Globe, Send, Instagram, MessagesSquare
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
const ChannelRoutingRules = lazy(() => import('./ChannelRoutingRules').then(m => ({ default: m.ChannelRoutingRules })));

const channelConfig = {
  whatsapp: { label: 'WhatsApp', icon: MessageSquare, color: 'text-success', bg: 'bg-success/10' },
  instagram: { label: 'Instagram', icon: Instagram, color: 'text-accent', bg: 'bg-accent/10' },
  telegram: { label: 'Telegram', icon: Send, color: 'text-info', bg: 'bg-info/10' },
  messenger: { label: 'Messenger', icon: MessagesSquare, color: 'text-primary', bg: 'bg-primary/10' },
  webchat: { label: 'Web Chat', icon: Globe, color: 'text-warning', bg: 'bg-warning/10' },
  email: { label: 'Gmail', icon: MessageSquare, color: 'text-destructive', bg: 'bg-destructive/10' },
};

type ChannelType = keyof typeof channelConfig;

interface ChannelConnection {
  id: string;
  channel_type: ChannelType;
  name: string;
  status: string;
  is_active: boolean;
  external_account_id: string | null;
  created_at: string;
}

export function OmnichannelManager() {
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: '', channel_type: 'instagram' as ChannelType });

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ['channel-connections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('channel_connections_safe')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ChannelConnection[];
    },
  });

  const addChannel = useMutation({
    mutationFn: async (channel: { name: string; channel_type: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      const { error } = await supabase.from('channel_connections').insert([{
        name: channel.name,
        channel_type: channel.channel_type as Database["public"]["Enums"]["channel_type"],
        created_by: profile?.id,
        status: 'pending_setup',
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
      toast.success('Canal adicionado! Configure as credenciais para ativá-lo.');
      setShowAddDialog(false);
      setNewChannel({ name: '', channel_type: 'instagram' });
    },
    onError: () => toast.error('Erro ao adicionar canal'),
  });

  const deleteChannel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('channel_connections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
      toast.success('Canal removido');
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected': return <Badge className="bg-success/10 text-success border-success/30">Conectado</Badge>;
      case 'pending_setup': return <Badge variant="secondary">Pendente</Badge>;
      default: return <Badge variant="destructive">Desconectado</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Globe className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base md:text-lg">Canais Omnichannel</CardTitle>
                <CardDescription className="text-xs md:text-sm">Gerencie todos os canais de comunicação em um só lugar</CardDescription>
              </div>
            </div>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto"><Plus className="w-4 h-4 mr-2" />Adicionar Canal</Button>
              </DialogTrigger>
              <DialogContent aria-describedby={undefined}>
                <DialogHeader>
                  <DialogTitle>Adicionar Novo Canal</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Nome do Canal</Label>
                    <Input
                      value={newChannel.name}
                      onChange={(e) => setNewChannel(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Instagram Principal"
                    />
                  </div>
                  <div>
                    <Label>Tipo de Canal</Label>
                    <Select
                      value={newChannel.channel_type}
                      onValueChange={(v) => setNewChannel(prev => ({ ...prev, channel_type: v as ChannelType }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(channelConfig).filter(([k]) => k !== 'whatsapp').map(([key, cfg]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-2">
                              <cfg.icon className={`w-4 h-4 ${cfg.color}`} />
                              {cfg.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    className="w-full" 
                    onClick={() => addChannel.mutate(newChannel)}
                    disabled={!newChannel.name || addChannel.isPending}
                  >
                    {addChannel.isPending ? 'Adicionando...' : 'Adicionar Canal'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando canais...</div>
          ) : channels.length === 0 ? (
            <div className="text-center py-12">
              <Globe className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhum canal adicional configurado</p>
              <p className="text-sm text-muted-foreground mt-1">
                Seus canais WhatsApp já estão ativos. Adicione Instagram, Telegram ou outros.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {channels.map((channel, index) => {
                const cfg = channelConfig[channel.channel_type] || channelConfig.webchat;
                return (
                  <motion.div
                    key={channel.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-4 p-4 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <div className={`p-2 rounded-lg ${cfg.bg}`}>
                      <cfg.icon className={`w-5 h-5 ${cfg.color}`} />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{channel.name}</p>
                      <p className="text-sm text-muted-foreground">{cfg.label}</p>
                    </div>
                    {getStatusBadge(channel.status)}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteChannel.mutate(channel.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Channel Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(channelConfig).map(([key, cfg]) => {
          const count = key === 'whatsapp' ? 1 : channels.filter(c => c.channel_type === key).length;
          return (
            <Card key={key} className="border-border/50">
              <CardContent className="p-4 text-center">
                <cfg.icon className={`w-6 h-6 ${cfg.color} mx-auto mb-2`} />
                <p className="text-xs text-muted-foreground">{cfg.label}</p>
                <p className="text-lg font-bold">{count}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Channel Routing Rules */}
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <ChannelRoutingRules />
      </Suspense>
    </div>
  );
}
