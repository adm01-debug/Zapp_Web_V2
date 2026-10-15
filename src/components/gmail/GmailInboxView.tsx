import { useState, useEffect, useMemo, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { Mail, Search, RefreshCw, Pencil, Inbox, Loader2, Clock, AlertTriangle } from 'lucide-react';
import { useGmail, type EmailThread } from '@/hooks/integrations/useGmail';
import { EMAIL_THREAD_DEFAULT_FILTERS } from '@/lib/emailThreadQuery';
import { EmailThreadView } from './EmailThreadView';
import { EmailComposer } from './EmailComposer';
import { ThreadListItem } from './ThreadListItem';
import { GmailLabelSidebar } from './GmailLabelSidebar';

const FOLDER_URL_PARAM = 'pasta';

/** Pasta selecionada na URL (`?pasta=`); sem parâmetro, Inbox. */
function readFolderFromUrl(): string {
  return new URLSearchParams(window.location.search).get(FOLDER_URL_PARAM) || 'INBOX';
}

/**
 * A thread pertence à pasta? `UNREAD`/`STARRED`/`IMPORTANT` têm flag própria na
 * linha; as demais (system e marcadores) valem pelo `gmail_label_id` em `label_ids`.
 */
function threadMatchesFolder(thread: EmailThread, folderId: string): boolean {
  switch (folderId) {
    case 'UNREAD':
      return Boolean(thread.is_unread);
    case 'STARRED':
      return Boolean(thread.is_starred);
    case 'IMPORTANT':
      return Boolean(thread.is_important);
    default:
      return Boolean(thread.label_ids?.includes(folderId));
  }
}

export default function GmailInboxView() {
  // OTH-005: esta tela legada ainda filtra o conjunto completo em memoria (abas e busca
  // local sobre o array); por isso pede o caminho `full` explicitamente.
  const {
    accounts, activeAccount, accountsLoading, accountsError, refetchAccounts,
    threads, threadsLoading, threadsError, refetchThreads,
    labels, syncInbox, unreadCount, subscribeToThreads,
  } = useGmail(undefined, null, { ...EMAIL_THREAD_DEFAULT_FILTERS, page: 1, full: true });
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [activeLabel, setActiveLabel] = useState<string>(readFolderFromUrl);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => { const unsub = subscribeToThreads(); return unsub; }, [subscribeToThreads]);

  // Voltar/avançar do navegador restaura a pasta da URL.
  useEffect(() => {
    const syncFolderFromUrl = () => setActiveLabel(readFolderFromUrl());
    window.addEventListener('popstate', syncFolderFromUrl);
    return () => window.removeEventListener('popstate', syncFolderFromUrl);
  }, []);

  const selectFolder = useCallback((folderId: string) => {
    setActiveLabel(folderId);
    const url = new URL(window.location.href);
    if (folderId === 'INBOX') url.searchParams.delete(FOLDER_URL_PARAM);
    else url.searchParams.set(FOLDER_URL_PARAM, folderId);
    window.history.pushState({}, '', url);
  }, []);

  const filteredThreads = useMemo(() => {
    let result = threads.filter((t) => threadMatchesFolder(t, activeLabel));
    if (statusFilter !== 'all') result = result.filter(t => t.status === statusFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t => t.subject?.toLowerCase().includes(q) || t.snippet?.toLowerCase().includes(q) || t.contact?.name?.toLowerCase().includes(q) || t.contact?.email?.toLowerCase().includes(q));
    }
    return result;
  }, [threads, activeLabel, statusFilter, searchQuery]);

  // Contagem por pasta vem dos rótulos do hook (`email_labels.message_count`).

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
        <EmptyState
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
            <Mail className="w-5 h-5 text-muted-foreground shrink-0" /><h2 className="text-base font-semibold">Gmail</h2>
            {unreadCount > 0 && <Badge variant="default" className="text-3xs px-1.5 py-0">{unreadCount} novo{unreadCount > 1 ? 's' : ''}</Badge>}
          </div>
          <Button variant="default" size="sm" onClick={() => setShowComposer(true)}><Pencil className="w-3.5 h-3.5 mr-1" />Compor</Button>
          <Button variant="outline" size="sm" onClick={() => syncInbox.mutate({})} disabled={syncInbox.isPending}><RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncInbox.isPending ? 'animate-spin' : ''}`} />Sync</Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar emails..." className="h-8 pl-8 text-sm" /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-[120px] h-8 text-xs" aria-label="Filtro de status"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="open">Aberto</SelectItem><SelectItem value="pending">Pendente</SelectItem><SelectItem value="resolved">Resolvido</SelectItem><SelectItem value="archived">Arquivado</SelectItem></SelectContent></Select>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        <GmailLabelSidebar
          labels={labels}
          activeLabel={activeLabel}
          onSelectLabel={selectFolder}
          className="shrink-0 border-b md:w-56 md:border-b-0 md:border-r"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {threadsStaleWithData && (
            <div role="alert" className="flex items-center gap-2 px-3 py-2 text-xs bg-destructive/10 text-destructive border-b">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1">Não foi possível atualizar a lista de emails. Os itens abaixo podem estar desatualizados.</span>
              <Button variant="link" size="sm" className="h-6 px-1 text-xs text-destructive" onClick={() => { void refetchThreads?.(); }}>Tentar de novo</Button>
            </div>
          )}
          <ScrollArea className="flex-1 min-h-0">
            {threadsLoading ? <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            : threadsFailedWithoutData ? (
              <EmptyState
                icon={AlertTriangle}
                title="Não foi possível carregar os emails"
                description="A consulta falhou. Isso não significa que a caixa esteja vazia — tente carregar de novo."
                actionLabel="Tentar de novo"
                onAction={() => { void refetchThreads?.(); }}
                className="py-16"
              />
            ) : filteredThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Inbox className="w-12 h-12 mb-3 opacity-20" /><p className="text-sm">{searchQuery ? 'Nenhum email encontrado' : 'Nenhum email nesta pasta'}</p>
                {!searchQuery && <Button variant="link" size="sm" className="mt-2" onClick={() => syncInbox.mutate({})}>Sincronizar emails</Button>}
              </div>
            ) : <div>{filteredThreads.map((thread) => <ThreadListItem key={thread.id} thread={thread} isSelected={false} onClick={() => setSelectedThread(thread)} />)}</div>}
          </ScrollArea>
        </div>
      </div>

      <div className="p-2 border-t flex items-center justify-between text-3xs text-muted-foreground">
        <span className="flex items-center gap-1 min-w-0"><Mail className="w-3 h-3 shrink-0" /><span className="truncate">{activeAccount?.email_address}</span></span>
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{activeAccount?.last_sync_at ? `Sync: ${new Date(activeAccount.last_sync_at).toLocaleString('pt-BR')}` : 'Nunca sincronizado'}</span>
      </div>

      <AnimatePresence>{showComposer && <EmailComposer mode="new" onClose={() => setShowComposer(false)} onSent={() => setShowComposer(false)} />}</AnimatePresence>
    </div>
  );
}
