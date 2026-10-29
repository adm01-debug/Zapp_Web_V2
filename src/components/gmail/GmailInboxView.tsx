import { useState, useEffect, useMemo, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { Mail, Search, RefreshCw, Pencil, Inbox, Loader2, Clock, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useGmail, type EmailThread, type EmailThreadListQueryWithStatus, type EmailThreadStatusFilter } from '@/hooks/integrations/useGmail';
import { EMAIL_THREAD_DEFAULT_FILTERS } from '@/lib/emailThreadQuery';
import { EmailThreadView } from './EmailThreadView';
import { EmailComposer } from './EmailComposer';
import { ThreadListItem } from './ThreadListItem';
import { GmailLabelSidebar } from './GmailLabelSidebar';

const FOLDER_URL_PARAM = 'pasta';

/** Espera do termo de busca antes de consultar o servidor (uma busca por rajada). */
const SEARCH_DEBOUNCE_MS = 300;

/** Pasta selecionada na URL (`?pasta=`); sem parâmetro, Inbox. */
function readFolderFromUrl(): string {
  return new URLSearchParams(window.location.search).get(FOLDER_URL_PARAM) || 'INBOX';
}

/**
 * Tradução da pasta para o filtro que vai ao servidor. A lista pagina: filtrar o
 * array em memória mostraria só o que caiu na página, então pasta/estado viram
 * filtro do banco, aplicado ANTES da paginação (igual à tela nova de e-mail).
 * `UNREAD`/`STARRED` são estado da thread; as demais pastas — `IMPORTANT`
 * inclusive — valem pelo `gmail_label_id` em `label_ids`, que é de onde
 * `gmail-helpers.ts` deriva `is_important`/`status` na sincronização.
 */
function folderQuery(folderId: string): { filter: 'all' | 'unread' | 'starred'; labelId: string } {
  switch (folderId) {
    case 'UNREAD':
      return { filter: 'unread', labelId: 'all' };
    case 'STARRED':
      return { filter: 'starred', labelId: 'all' };
    default:
      return { filter: 'all', labelId: folderId };
  }
}

export default function GmailInboxView() {
  // OTH-005: a tela antiga pedia o conjunto completo (`full: true`) e filtrava em
  // memória; agora ela usa a lista paginada — filtros e janela vão ao servidor.
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeLabel, setActiveLabel] = useState<string>(readFolderFromUrl);
  const [statusFilter, setStatusFilter] = useState<'all' | EmailThreadStatusFilter>('all');

  const listQuery = useMemo<EmailThreadListQueryWithStatus>(() => ({
    ...EMAIL_THREAD_DEFAULT_FILTERS,
    ...folderQuery(activeLabel),
    search: debouncedSearch,
    threadStatus: statusFilter === 'all' ? undefined : statusFilter,
    page,
  }), [activeLabel, debouncedSearch, statusFilter, page]);

  const {
    activeAccount, accountsLoading, accountsError, refetchAccounts,
    threads, threadsLoading, threadsError, refetchThreads,
    threadsTotalCount, threadsPageCount,
    labels, syncInbox, unreadCount, subscribeToThreads,
  } = useGmail(undefined, null, listQuery);
  // Ajuste durante o render (react-hooks/set-state-in-effect proíbe setState síncrono
  // dentro do efeito): se o total encolher — realtime ou filtro —, a página desce para
  // a última disponível, em vez de ficar presa numa página que deixou de existir.
  const [lastPageCount, setLastPageCount] = useState(threadsPageCount);
  if (lastPageCount !== threadsPageCount) {
    setLastPageCount(threadsPageCount);
    if (!threadsLoading && page > Math.max(1, threadsPageCount)) setPage(Math.max(1, threadsPageCount));
  }
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [showComposer, setShowComposer] = useState(false);

  useEffect(() => { const unsub = subscribeToThreads(); return unsub; }, [subscribeToThreads]);

  // Busca por rajada: só consulta o servidor depois da pausa de digitação.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Voltar/avançar do navegador restaura a pasta da URL.
  useEffect(() => {
    const syncFolderFromUrl = () => { setActiveLabel(readFolderFromUrl()); setPage(1); };
    window.addEventListener('popstate', syncFolderFromUrl);
    return () => window.removeEventListener('popstate', syncFolderFromUrl);
  }, []);

  const selectFolder = useCallback((folderId: string) => {
    setActiveLabel(folderId);
    setPage(1);
    const url = new URL(window.location.href);
    if (folderId === 'INBOX') url.searchParams.delete(FOLDER_URL_PARAM);
    else url.searchParams.set(FOLDER_URL_PARAM, folderId);
    window.history.pushState({}, '', url);
  }, []);

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
          <Loader2 aria-hidden="true" className="w-8 h-8 motion-safe:animate-spin text-muted-foreground mb-4" />
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
            <Mail className="w-5 h-5 text-muted-foreground shrink-0" /><h2 className="text-base font-semibold">Gmail</h2>
            {unreadCount > 0 && <Badge variant="default" className="text-3xs px-1.5 py-0">{unreadCount} novo{unreadCount > 1 ? 's' : ''}</Badge>}
          </div>
          <Button variant="default" size="sm" onClick={() => setShowComposer(true)}><Pencil className="w-3.5 h-3.5 mr-1" />Compor</Button>
          <Button variant="outline" size="sm" onClick={() => syncInbox.mutate({})} disabled={syncInbox.isPending}><RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncInbox.isPending ? 'motion-safe:animate-spin' : ''}`} />Sync</Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><Input value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} placeholder="Buscar emails..." className="h-8 pl-8 text-sm" /></div>
          <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value as 'all' | EmailThreadStatusFilter); setPage(1); }}><SelectTrigger className="w-[120px] h-8 text-xs" aria-label="Filtro de status"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="open">Aberto</SelectItem><SelectItem value="pending">Pendente</SelectItem><SelectItem value="resolved">Resolvido</SelectItem><SelectItem value="archived">Arquivado</SelectItem></SelectContent></Select>
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
            {threadsLoading ? <div role="status" aria-busy="true" aria-live="polite" aria-label="Carregando emails" className="flex items-center justify-center py-16"><Loader2 aria-hidden="true" className="w-6 h-6 motion-safe:animate-spin text-muted-foreground" /></div>
            : threadsFailedWithoutData ? (
              <GenericEmptyState
                icon={AlertTriangle}
                title="Não foi possível carregar os emails"
                description="A consulta falhou. Isso não significa que a caixa esteja vazia — tente carregar de novo."
                actionLabel="Tentar de novo"
                onAction={() => { void refetchThreads?.(); }}
                className="py-16"
              />
            ) : threads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Inbox className="w-12 h-12 mb-3 opacity-20" /><p className="text-sm">{searchQuery ? 'Nenhum email encontrado' : 'Nenhum email nesta pasta'}</p>
                {!searchQuery && <Button variant="link" size="sm" className="mt-2" onClick={() => syncInbox.mutate({})}>Sincronizar emails</Button>}
              </div>
            ) : <div>{threads.map((thread) => <ThreadListItem key={thread.id} thread={thread} isSelected={false} onClick={() => setSelectedThread(thread)} />)}</div>}
          </ScrollArea>
          {threads.length > 0 && (
            <nav aria-label="Paginação de emails" className="flex items-center justify-between gap-2 border-t px-3 py-1.5 text-3xs text-muted-foreground">
              <span>Página {page} de {threadsPageCount} · {threadsTotalCount} email{threadsTotalCount > 1 ? 's' : ''}</span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" aria-label="Página anterior" disabled={threadsLoading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft className="w-3.5 h-3.5" /></Button>
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" aria-label="Próxima página" disabled={threadsLoading || page >= threadsPageCount} onClick={() => setPage((current) => Math.min(threadsPageCount, current + 1))}><ChevronRight className="w-3.5 h-3.5" /></Button>
              </div>
            </nav>
          )}
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
