import { useState, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { Mail, Search, RefreshCw, Pencil, Inbox, Star, Send as SendIcon, MailOpen, Loader2, Clock, AlertTriangle } from 'lucide-react';
import { useGmail, type EmailThread } from '@/hooks/integrations/useGmail';
import { EMAIL_THREAD_DEFAULT_FILTERS } from '@/lib/emailThreadQuery';
import { EmailThreadView } from './EmailThreadView';
import { EmailComposer } from './EmailComposer';
import { ThreadListItem } from './ThreadListItem';

export default function GmailInboxView() {
  // OTH-005: esta tela legada ainda filtra o conjunto completo em memoria (abas e busca
  // local sobre o array); por isso pede o caminho `full` explicitamente.
  const {
    accounts, activeAccount, accountsLoading, accountsError, refetchAccounts,
    threads, threadsLoading, threadsError, refetchThreads,
    labels, syncInbox, unreadCount, starredCount, subscribeToThreads,
  } = useGmail(undefined, null, { ...EMAIL_THREAD_DEFAULT_FILTERS, page: 1, full: true });
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [activeTab, setActiveTab] = useState('inbox');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => { const unsub = subscribeToThreads(); return unsub; }, [subscribeToThreads]);

  const filteredThreads = useMemo(() => {
    let result = threads;
    if (activeTab === 'starred') result = result.filter(t => t.is_starred);
    else if (activeTab === 'sent') result = result.filter(t => t.label_ids?.includes('SENT'));
    else if (activeTab === 'unread') result = result.filter(t => t.is_unread);
    if (statusFilter !== 'all') result = result.filter(t => t.status === statusFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t => t.subject?.toLowerCase().includes(q) || t.snippet?.toLowerCase().includes(q) || t.contact?.name?.toLowerCase().includes(q) || t.contact?.email?.toLowerCase().includes(q));
    }
    return result;
  }, [threads, activeTab, statusFilter, searchQuery]);

  // R2-API-059: falha de consulta nao e ausencia de dado. So afirma "nao ha
  // thread" quando a consulta terminou bem com lista vazia; com erro e sem
  // nada em cache a tela mostra o erro e oferece recarregar.
  const threadsFailedWithoutData = Boolean(threadsError) && !threadsLoading && threads.length === 0;
  const threadsStaleWithData = Boolean(threadsError) && !threadsLoading && threads.length > 0;

  if (selectedThread) return <EmailThreadView thread={selectedThread} onBack={() => setSelectedThread(null)} />;

  if (!activeAccount) {
    if (accountsLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full py-20" role="status">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">Verificando conta Gmail...</p>
        </div>
      );
    }
    if (accountsError) {
      return (
        <GenericEmptyState
          icon={AlertTriangle}
          title="Não foi possível verificar suas contas Gmail"
          description="A consulta de contas falhou. Isso não quer dizer que a conta foi desconectada — tente carregar de novo."
          actionLabel="Tentar de novo"
          onAction={() => { void refetchAccounts?.(); }}
          className="py-20"
        />
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
        <Mail className="w-16 h-16 text-muted-foreground/20 mb-4" />
        <h1 className="text-lg font-semibold mb-2">Gmail não conectado</h1>
        <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">Conecte sua conta Gmail nas Integracoes para visualizar e gerenciar seus emails aqui.</p>
        <Badge variant="outline" className="text-xs">Integracoes &rarr; Gmail &rarr; Conectar</Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full min-w-0">
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-1">
            <Mail className="w-5 h-5 text-destructive shrink-0" /><h2 className="text-base font-semibold">Gmail</h2>
            {unreadCount > 0 && <Badge variant="default" className="text-3xs px-1.5 py-0">{unreadCount} novo{unreadCount > 1 ? 's' : ''}</Badge>}
          </div>
          <Button variant="default" size="sm" onClick={() => setShowComposer(true)}><Pencil className="w-3.5 h-3.5 mr-1" />Compor</Button>
          <Button variant="outline" size="sm" onClick={() => syncInbox.mutate({})} disabled={syncInbox.isPending}><RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncInbox.isPending ? 'animate-spin' : ''}`} />Sync</Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar emails..." className="h-8 pl-8 text-sm" /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="open">Aberto</SelectItem><SelectItem value="pending">Pendente</SelectItem><SelectItem value="resolved">Resolvido</SelectItem><SelectItem value="archived">Arquivado</SelectItem></SelectContent></Select>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start rounded-none border-b px-3 h-9 bg-transparent">
          <TabsTrigger value="inbox" className="text-xs gap-1 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"><Inbox className="w-3.5 h-3.5" />Inbox{unreadCount > 0 && <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">{unreadCount}</Badge>}</TabsTrigger>
          <TabsTrigger value="unread" className="text-xs gap-1 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"><MailOpen className="w-3.5 h-3.5" />Não lidos</TabsTrigger>
          <TabsTrigger value="starred" className="text-xs gap-1 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"><Star className="w-3.5 h-3.5" />Favoritos{starredCount > 0 && <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">{starredCount}</Badge>}</TabsTrigger>
          <TabsTrigger value="sent" className="text-xs gap-1 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"><SendIcon className="w-3.5 h-3.5" />Enviados</TabsTrigger>
        </TabsList>
        <TabsContent value={activeTab} className="flex-1 mt-0 min-h-0">
          {threadsStaleWithData && (
            <div role="alert" className="flex items-center gap-2 px-3 py-2 text-xs bg-destructive/10 text-destructive border-b">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1">Não foi possível atualizar a lista de emails. Os itens abaixo podem estar desatualizados.</span>
              <Button variant="link" size="sm" className="h-6 px-1 text-xs text-destructive" onClick={() => { void refetchThreads?.(); }}>Tentar de novo</Button>
            </div>
          )}
          <ScrollArea className="h-full">
            {threadsLoading ? <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            : threadsFailedWithoutData ? (
              <GenericEmptyState
                icon={AlertTriangle}
                title="Não foi possível carregar os emails"
                description="A consulta falhou. Isso não significa que a caixa esteja vazia — tente carregar de novo."
                actionLabel="Tentar de novo"
                onAction={() => { void refetchThreads?.(); }}
                className="py-16"
              />
            ) : filteredThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Inbox className="w-12 h-12 mb-3 opacity-20" /><p className="text-sm">{searchQuery ? 'Nenhum email encontrado' : 'Inbox vazio'}</p>
                {!searchQuery && <Button variant="link" size="sm" className="mt-2" onClick={() => syncInbox.mutate({})}>Sincronizar emails</Button>}
              </div>
            ) : <div>{filteredThreads.map((thread) => <ThreadListItem key={thread.id} thread={thread} isSelected={false} onClick={() => setSelectedThread(thread)} />)}</div>}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <div className="p-2 border-t flex items-center justify-between text-3xs text-muted-foreground">
        <span className="flex items-center gap-1 min-w-0"><Mail className="w-3 h-3 shrink-0" /><span className="truncate">{activeAccount?.email_address}</span></span>
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{activeAccount?.last_sync_at ? `Sync: ${new Date(activeAccount.last_sync_at).toLocaleString('pt-BR')}` : 'Nunca sincronizado'}</span>
      </div>

      <AnimatePresence>{showComposer && <EmailComposer mode="new" onClose={() => setShowComposer(false)} onSent={() => setShowComposer(false)} />}</AnimatePresence>
    </div>
  );
}
