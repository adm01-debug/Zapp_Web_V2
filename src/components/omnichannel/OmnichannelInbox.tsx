import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Instagram, Send as SendIcon, Facebook, Mail, Globe, Filter, RefreshCw, Loader2, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { RealtimeService } from '@/services/realtime.service';
import { buildConversations, normalizeMessage } from '@/hooks/realtime/realtimeUtils';
import { openContactChat } from '@/components/catalog/useSendProduct';
import type {
  ConversationContact,
  ConversationWithMessages,
  RealtimeMessage,
} from '@/hooks/chat/useRealtimeMessages';

type ChannelType = 'whatsapp' | 'instagram' | 'telegram' | 'messenger' | 'email' | 'webchat';

const CHANNEL_CONFIG: Record<ChannelType, { icon: typeof MessageSquare; label: string; color: string }> = {
  whatsapp: { icon: MessageSquare, label: 'WhatsApp', color: 'text-success bg-success/10' },
  instagram: { icon: Instagram, label: 'Instagram', color: 'text-accent bg-accent/10' },
  telegram: { icon: SendIcon, label: 'Telegram', color: 'text-info bg-info/10' },
  messenger: { icon: Facebook, label: 'Messenger', color: 'text-info bg-info/10' },
  email: { icon: Mail, label: 'Email', color: 'text-warning bg-warning/10' },
  webchat: { icon: Globe, label: 'Webchat', color: 'text-secondary bg-secondary/10' },
};

// Rótulos de `contacts.conversation_status` (mesma tabela usada na aba Canais do CRM).
const CONVERSATION_STATUS_LABEL: Record<string, string> = {
  open: 'Aberta',
  pending: 'Pendente',
  waiting: 'Aguardando',
  resolved: 'Resolvida',
  closed: 'Encerrada',
  archived: 'Arquivada',
};

// R2-API-064: a tela projetava cadastros (contacts, 200 por updated_at) como se fossem
// conversas — sem última mensagem, sem não lidas e sem abrir a conversa; a busca era
// local a essa amostra. Agora ela consome a projeção canônica de conversas e busca no
// universo de contatos.
const SEARCH_MIN_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_RESULT_LIMIT = 50;
const SEARCH_MESSAGES_LIMIT = 500;

function toChannelType(value: string | null | undefined): ChannelType {
  return value && value in CHANNEL_CONFIG ? (value as ChannelType) : 'whatsapp';
}

/**
 * Busca no banco (universo autorizado de contatos) por nome ou telefone e reconstrói
 * cada conversa com a última mensagem e as não lidas — a amostra carregada na tela não
 * é o limite da busca.
 */
async function searchConversations(term: string): Promise<ConversationWithMessages[]> {
  // `,` `(` `)` `%` `\` quebram a sintaxe do filtro `or=` do PostgREST.
  const sanitized = term.replace(/[%,()\\]/g, ' ').trim();
  if (sanitized.length < SEARCH_MIN_LENGTH) return [];

  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('is_lid_legacy', false)
    .or(`name.ilike.%${sanitized}%,phone.ilike.%${sanitized}%`)
    .order('updated_at', { ascending: false })
    .limit(SEARCH_RESULT_LIMIT);

  if (error) throw error;

  const contactRows = (contacts ?? []) as ConversationContact[];
  if (contactRows.length === 0) return [];

  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .in('contact_id', contactRows.map((row) => row.id))
    .order('created_at', { ascending: false })
    .limit(SEARCH_MESSAGES_LIMIT);

  if (messagesError) throw messagesError;

  return buildConversations(
    contactRows,
    ((messages ?? []) as RealtimeMessage[]).map(normalizeMessage),
  );
}

export function OmnichannelInbox() {
  const [activeMainTab, setActiveMainTab] = useState<'channels' | 'email'>('channels');
  const [conversations, setConversations] = useState<ConversationWithMessages[]>([]);
  // Guardamos o termo junto do resultado: o que a tela mostra é derivado (sem setState
  // síncrono no efeito) e um resultado antigo nunca aparece como se fosse do termo atual.
  const [searchResults, setSearchResults] = useState<{
    term: string;
    conversations: ConversationWithMessages[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [channelStats, setChannelStats] = useState<Record<string, number>>({});
  const [connections, setConnections] = useState<Record<string, unknown>[]>([]);

  const activeSearchTerm = search.trim().length >= SEARCH_MIN_LENGTH ? search.trim() : '';

  const loadConnections = async () => {
    const { data } = await supabase
      .from('channel_connections_safe')
      .select('*')
      .eq('is_active', true);

    if (data) setConnections(data);
  };

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const projection = await RealtimeService.fetchInitialConversations();
      // Stubs do webhook (LID legado) não são conversa e não entram na lista nem nas contagens.
      const visible = projection.filter((conversation) => conversation.contact.is_lid_legacy !== true);
      setConversations(visible);

      const stats: Record<string, number> = {};
      visible.forEach((conversation) => {
        const type = toChannelType(conversation.contact.channel_type);
        stats[type] = (stats[type] || 0) + 1;
      });
      setChannelStats(stats);
    } catch (err) {
      toast.error('Erro ao carregar inbox unificado');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await loadConnections();
      await loadConversations();
    };
    void init();
  }, [loadConversations]);

  // R2-API-064: a busca não pode ficar presa à amostra carregada — ela vai ao banco.
  useEffect(() => {
    const term = activeSearchTerm;
    if (!term) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const results = await searchConversations(term);
          if (!cancelled) setSearchResults({ term, conversations: results });
        } catch (err) {
          if (!cancelled) {
            setSearchResults({ term, conversations: [] });
            toast.error('Erro ao buscar conversas');
          }
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeSearchTerm]);

  const searchProjection =
    activeSearchTerm.length > 0 && searchResults?.term === activeSearchTerm
      ? searchResults.conversations
      : null;
  const searching = activeSearchTerm.length > 0 && searchProjection === null;
  const hasServerSearch = searchProjection !== null;
  const displayedConversations = (searchProjection ?? conversations).filter(
    (conversation) => activeChannel === 'all' || toChannelType(conversation.contact.channel_type) === activeChannel,
  );
  const searchTruncated = searchProjection !== null && searchProjection.length >= SEARCH_RESULT_LIMIT;

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
            <TabsTrigger value="channels" className="gap-1.5 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
              <Globe className="w-4 h-4" />
              Canais
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-1.5 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
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
              <Button variant="outline" size="sm" onClick={loadConversations} disabled={loading} className="w-full sm:w-auto">
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
                          <p className="text-3xs text-muted-foreground">{config.label}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                aria-label="Buscar conversa por nome ou telefone"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-10"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" aria-hidden="true" />
              )}
            </div>

            {/* Message List */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    Conversas ({displayedConversations.length})
                  </CardTitle>
                  {activeChannel !== 'all' && (
                    <Button variant="ghost" size="sm" onClick={() => setActiveChannel('all')}>
                      Limpar filtro
                    </Button>
                  )}
                </div>
                <CardDescription>
                  {hasServerSearch
                    ? `${displayedConversations.length} ${displayedConversations.length === 1 ? 'resultado' : 'resultados'} em todos os contatos${searchTruncated ? ` (exibindo os ${SEARCH_RESULT_LIMIT} primeiros)` : ''}.`
                    : `Mostrando as ${conversations.length} conversas recentes. A busca procura em todos os contatos.`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-1">
                    {loading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-16 bg-muted/50 animate-pulse rounded-lg" />
                      ))
                    ) : displayedConversations.length === 0 ? (
                      <div className="text-center py-12">
                        <Globe className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-muted-foreground">
                          {hasServerSearch ? 'Nenhuma conversa encontrada para a busca' : 'Nenhuma conversa encontrada'}
                        </p>
                      </div>
                    ) : (
                      displayedConversations.map((conversation) => {
                        const { contact: rowContact, lastMessage, unreadCount } = conversation;
                        const channelType = toChannelType(rowContact.channel_type);
                        const timestamp = lastMessage?.created_at ?? rowContact.updated_at ?? rowContact.created_at;
                        const statusLabel = CONVERSATION_STATUS_LABEL[rowContact.conversation_status ?? ''] ?? null;
                        const showStatus = Boolean(statusLabel) && rowContact.conversation_status !== 'open';
                        return (
                          <motion.button
                            key={rowContact.id}
                            type="button"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            onClick={() => openContactChat(rowContact.id)}
                            aria-label={`Abrir conversa de ${rowContact.name}${unreadCount > 0 ? ` — ${unreadCount} mensagens não lidas` : ''}`}
                            className="flex w-full items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <div className="relative">
                              <Avatar className="w-10 h-10">
                                <AvatarFallback className="text-xs">
                                  {rowContact.name.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="absolute -bottom-1 -right-1">
                                {getChannelIcon(channelType)}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-medium text-sm truncate">{rowContact.name}</p>
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {format(new Date(timestamp), 'HH:mm', { locale: ptBR })}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {lastMessage ? lastMessage.content : `Sem mensagens ainda — ${rowContact.phone}`}
                              </p>
                            </div>
                            {showStatus && (
                              <Badge variant="secondary" className="shrink-0 text-2xs">
                                {statusLabel}
                              </Badge>
                            )}
                            {unreadCount > 0 && (
                              <span
                                aria-hidden="true"
                                className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-3xs font-medium text-primary-foreground"
                              >
                                {unreadCount > 99 ? '99+' : unreadCount}
                              </span>
                            )}
                          </motion.button>
                        );
                      })
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
          <EmailChatInbox embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
