import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Instagram, Send as SendIcon, Facebook, Mail, Globe, Filter, RefreshCw, Loader2, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { EmailChatInbox } from '@/components/email/EmailChatInbox';

type ChannelType = 'whatsapp' | 'instagram' | 'telegram' | 'messenger' | 'email' | 'webchat';

interface UnifiedMessage {
  id: string;
  contactName: string;
  contactPhone: string;
  channelType: ChannelType;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
  status: string;
  assignedTo: string | null;
}

const CHANNEL_CONFIG: Record<ChannelType, { icon: typeof MessageSquare; label: string; color: string }> = {
  whatsapp: { icon: MessageSquare, label: 'WhatsApp', color: 'text-success bg-success/10' },
  instagram: { icon: Instagram, label: 'Instagram', color: 'text-accent bg-accent/10' },
  telegram: { icon: SendIcon, label: 'Telegram', color: 'text-info bg-info/10' },
  messenger: { icon: Facebook, label: 'Messenger', color: 'text-info bg-info/10' },
  email: { icon: Mail, label: 'Email', color: 'text-warning bg-warning/10' },
  webchat: { icon: Globe, label: 'Webchat', color: 'text-secondary bg-secondary/10' },
};

export function OmnichannelInbox() {
  const [activeMainTab, setActiveMainTab] = useState<'channels' | 'email'>('channels');
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [channelStats, setChannelStats] = useState<Record<string, number>>({});
  const [connections, setConnections] = useState<Record<string, unknown>[]>([]);

  const loadConnections = async () => {
    const { data } = await supabase
      .from('channel_connections_safe')
      .select('*')
      .eq('is_active', true);

    if (data) setConnections(data);
  };

  const loadUnifiedInbox = async () => {
    setLoading(true);
    try {
      const { data: contacts, error } = await supabase
        .from('contacts')
        .select('id, name, phone, channel_type, updated_at, assigned_to')
        .eq('is_lid_legacy', false)
        .order('updated_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      const unified: UnifiedMessage[] = (contacts || []).map(contact => ({
        id: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        channelType: (contact.channel_type as ChannelType) || 'whatsapp',
        lastMessage: '',
        timestamp: contact.updated_at,
        unread: false,
        status: 'open',
        assignedTo: contact.assigned_to,
      }));

      setMessages(unified);

      const stats: Record<string, number> = {};
      unified.forEach(m => {
        stats[m.channelType] = (stats[m.channelType] || 0) + 1;
      });
      setChannelStats(stats);
    } catch (err) {
      toast.error('Erro ao carregar inbox unificado');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConnections();
    loadUnifiedInbox();
  }, []);

  const filteredMessages = messages.filter(m => {
    if (activeChannel !== 'all' && m.channelType !== activeChannel) return false;
    if (search) {
      const s = search.toLowerCase();
      return m.contactName.toLowerCase().includes(s) || m.contactPhone.includes(s);
    }
    return true;
  });

  const getChannelIcon = (type: ChannelType) => {
    const config = CHANNEL_CONFIG[type];
    const Icon = config.icon;
    return (
      <div className={`p-1.5 rounded-lg ${config.color}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Main Tabs: Channels | Email Chat */}
      <Tabs value={activeMainTab} onValueChange={(v) => setActiveMainTab(v as 'channels' | 'email')} className="flex flex-col h-full">
        <div className="border-b px-4">
          <TabsList className="h-10 bg-transparent">
            <TabsTrigger value="channels" className="gap-1.5 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
              <Globe className="w-4 h-4" />
              Canais
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-1.5 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
              <Mail className="w-4 h-4" />
              Email Chat
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Channels tab (original content) */}
        <TabsContent value="channels" className="flex-1 mt-0 overflow-auto">
          <div className="space-y-4 md:space-y-6 p-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <Globe className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg md:text-xl font-bold">Inbox Omnichannel</h2>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Todas as conversas em um só lugar • {connections.length} canais conectados
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={loadUnifiedInbox} disabled={loading} className="w-full sm:w-auto">
                <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>

            {/* Channel Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {Object.entries(CHANNEL_CONFIG).map(([type, config]) => {
                const Icon = config.icon;
                const count = channelStats[type] || 0;
                return (
                  <Card 
                    key={type} 
                    className={`cursor-pointer transition-all ${activeChannel === type ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`}
                    onClick={() => setActiveChannel(activeChannel === type ? 'all' : type)}
                  >
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-center gap-2 justify-center">
                        <div className={`p-1.5 rounded ${config.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-lg font-bold">{count}</p>
                          <p className="text-[10px] text-muted-foreground">{config.label}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Message List */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    Conversas ({filteredMessages.length})
                  </CardTitle>
                  {activeChannel !== 'all' && (
                    <Button variant="ghost" size="sm" onClick={() => setActiveChannel('all')}>
                      Limpar filtro
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-1">
                    {loading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-16 bg-muted/50 animate-pulse rounded-lg" />
                      ))
                    ) : filteredMessages.length === 0 ? (
                      <div className="text-center py-12">
                        <Globe className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground">Nenhuma conversa encontrada</p>
                      </div>
                    ) : (
                      filteredMessages.map((msg) => (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                        >
                          <div className="relative">
                            <Avatar className="w-10 h-10">
                              <AvatarFallback className="text-xs">
                                {msg.contactName.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="absolute -bottom-1 -right-1">
                              {getChannelIcon(msg.channelType)}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-sm truncate">{msg.contactName}</p>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(msg.timestamp), 'HH:mm', { locale: ptBR })}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {msg.contactPhone}
                            </p>
                          </div>
                          {msg.unread && (
                            <div className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
                          )}
                        </motion.div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Connected Channels */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Canais Conectados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {connections.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum canal adicional conectado</p>
                  ) : (
                    connections.map((conn) => {
                      const channelType = (conn.channel_type as ChannelType) || 'webchat';
                      const config = CHANNEL_CONFIG[channelType];
                      return (
                        <Badge key={conn.id as string} variant="outline" className="gap-1">
                          {config && <config.icon className="w-3 h-3" />}
                          {(conn.name as string) || config?.label || channelType}
                          <span className="w-1.5 h-1.5 rounded-full bg-success ml-1" />
                        </Badge>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Email Chat tab */}
        <TabsContent value="email" className="flex-1 mt-0 min-h-0">
          <EmailChatInbox />
        </TabsContent>
      </Tabs>
    </div>
  );
}
