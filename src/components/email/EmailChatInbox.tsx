import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { CircleHelp, Loader2, Mail, Plus, RefreshCw, Search, Wifi } from 'lucide-react';
import { useGmail } from '@/hooks/integrations/useGmail';
import { useEmailThreadListQuery } from '@/hooks/email/useEmailThreadListQuery';
import { useEmailThreadForContact } from '@/hooks/integrations/useEmailThreadForContact';
import { EmailThreadList } from './EmailThreadList';
import { EmailChatThread } from './EmailChatThread';
import { EmailContactPanel } from './EmailContactPanel';
import { EmailComposer } from '@/components/gmail/EmailComposer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { EmailAttachment, EmailMessage } from '@/hooks/integrations/useGmail';
import { emailLoadErrorCopy } from '@/lib/emailErrorState';

function matchesWideDetailsLayout(): boolean {
  return typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 1280px)').matches;
}

type EmailContactIntent = { contactId: string | null; to: string | null };

/** Lê ?emailContact/?emailTo da URL; ?emailThread explícito suprime a intenção. */
function readEmailContactIntent(): EmailContactIntent | null {
  const params = new URLSearchParams(window.location.search);
  const contactId = params.get('emailContact');
  const to = params.get('emailTo');
  if (!contactId && !to) return null;
  if (params.get('emailThread')) return null;
  return { contactId, to };
}

/** Remove emailContact/emailTo da entrada atual sem empilhar histórico. */
function stripEmailContactParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('emailContact');
  url.searchParams.delete('emailTo');
  const base = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
  window.history.replaceState(base, '', url.href);
}

interface EmailChatInboxProps {
  embedded?: boolean;
}

type ThreadContextData = {
  messages: EmailMessage[];
  attachments: Array<EmailAttachment & { gmail_message_id?: string }>;
};

export function EmailChatInbox({ embedded = false }: EmailChatInboxProps) {
  const [accountId, setAccountId] = useState<string>();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('emailThread'));
  // OTH-005: filtros e página vivem fora da lista e vão ao servidor na consulta.
  const { filters, page, setPage, updateFilters, setSearch, resetFilters, query: listState } = useEmailThreadListQuery();
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  // A busca do cabeçalho entra na mesma consulta; a espera curta evita uma ida ao
  // servidor por caractere digitado.
  const [debouncedGlobalSearch, setDebouncedGlobalSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedGlobalSearch(globalSearchQuery), 300);
    return () => clearTimeout(timer);
  }, [globalSearchQuery]);
  // Termo novo volta para a primeira página — a janela anterior era de outro resultado.
  useEffect(() => { setPage(1); }, [debouncedGlobalSearch, setPage]);
  const listQuery = useMemo(
    () => ({ ...listState, search: (debouncedGlobalSearch || listState.search).trim() }),
    [debouncedGlobalSearch, listState],
  );
  const {
    accounts, accountsLoading, accountsError, refetchAccounts, activeAccount,
    threads, threadsLoading, threadsError, connectGmail, labels, syncInbox,
    syncLabels, unreadCount, threadsTotalCount, threadsPageCount, subscribeToThreads, requestedThread, downloadAttachment,
  } = useGmail(accountId, selectedThreadId, listQuery);
  // A página pedida nunca passa do intervalo conhecido: no clique ela já é
  // limitada a `Math.min(page, Math.max(1, threadsPageCount))` e, se o total
  // encolher depois (realtime/filtro), este efeito refaz a consulta na última
  // página. Enquanto carrega, o total é desconhecido e nada é mexido.
  useEffect(() => {
    if (!threadsLoading && page > threadsPageCount) setPage(threadsPageCount);
  }, [threadsLoading, threadsPageCount, page, setPage]);
  const [showComposer, setShowComposer] = useState(false);
  const [composerTo, setComposerTo] = useState('');
  // C03 — intenção vinda do painel do contato (?emailContact/?emailTo); só é
  // consumida depois de haver conta Gmail ativa.
  const [contactIntent, setContactIntent] = useState<EmailContactIntent | null>(readEmailContactIntent);
  const [showDetails, setShowDetails] = useState(matchesWideDetailsLayout);
  const [isWideDetailsLayout, setIsWideDetailsLayout] = useState(matchesWideDetailsLayout);
  const [threadContext, setThreadContext] = useState<{ accountId: string | null } & ThreadContextData>({ accountId: null, messages: [], attachments: [] });
  // R2-COM-001: a identidade deste callback precisa ser estável e o estado só pode mudar
  // quando mensagens/anexos mudam de verdade. Uma arrow inline gravava um objeto novo a cada
  // render do pai, o que re-disparava o efeito do filho em ciclo.
  const activeAccountId = activeAccount?.id ?? null;
  const contactThread = useEmailThreadForContact(activeAccountId, contactIntent?.contactId);
  const handleThreadContextChange = useCallback((data: ThreadContextData) => {
    if (!activeAccountId) return;
    setThreadContext(previous => (
      previous.accountId === activeAccountId && previous.messages === data.messages && previous.attachments === data.attachments
        ? previous
        : { accountId: activeAccountId, messages: data.messages, attachments: data.attachments }
    ));
  }, [activeAccountId]);
  const detailsTriggerRef = useRef<HTMLElement | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const selectedThread = useMemo(
    () => threads.find(thread => thread.id === selectedThreadId) ?? requestedThread ?? null,
    [requestedThread, selectedThreadId, threads],
  );
  const accountsErrorCopy = useMemo(() => emailLoadErrorCopy(accountsError), [accountsError]);

  useEffect(() => subscribeToThreads(), [subscribeToThreads]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(min-width: 1280px)');
    const update = () => setIsWideDetailsLayout(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const syncEmailParamsFromUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    setSelectedThreadId(params.get('emailThread'));
    setThreadContext({ accountId: null, messages: [], attachments: [] });
    const intent = readEmailContactIntent();
    if (!intent && (params.has('emailContact') || params.has('emailTo'))) {
      // ?emailThread explícito venceu — os parâmetros de contato são descartados.
      stripEmailContactParams();
    }
    setContactIntent(intent);
  }, []);

  useEffect(() => {
    const onZappNavigate = (event: Event) => {
      // Mesma view (navigateToView com a view já ativa usa replaceState, que não
      // dispara popstate): a intenção de contato ainda precisa ser re-lida.
      if ((event as CustomEvent<{ view?: string }>).detail?.view === 'email-chat') syncEmailParamsFromUrl();
    };
    window.addEventListener('popstate', syncEmailParamsFromUrl);
    window.addEventListener('zapp:navigate', onZappNavigate);
    return () => {
      window.removeEventListener('popstate', syncEmailParamsFromUrl);
      window.removeEventListener('zapp:navigate', onZappNavigate);
    };
  }, [syncEmailParamsFromUrl]);

  const navigateToThread = useCallback((threadId: string | null, replace = false) => {
    const url = new URL(window.location.href);
    if (threadId) url.searchParams.set('emailThread', threadId);
    else url.searchParams.delete('emailThread');
    window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
    setSelectedThreadId(threadId);
    setThreadContext({ accountId: null, messages: [], attachments: [] });
    if (threadId) setShowDetails(matchesWideDetailsLayout());
  }, []);

  // C03 — consome ?emailContact/?emailTo SÓ com conta Gmail ativa (sem conta a
  // tela de conectar segue e os parâmetros ficam preservados até ela existir).
  // Achou a conversa mais recente do contato → abre na mesma entrada; não achou
  // (ou a consulta falhou) → compositor novo com o destinatário. Ao consumir, os
  // parâmetros saem da URL para não reabrir no recarregar nem no voltar.
  // Adiado p/ microtask: evita setState síncrono no corpo do effect
  // (react-hooks/set-state-in-effect) — o estado muda em resposta a URL + consulta.
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => {
      if (!alive) return;
      const params = new URLSearchParams(window.location.search);
      if ((params.has('emailContact') || params.has('emailTo')) && params.get('emailThread')) {
        // ?emailThread explícito vence — os parâmetros de contato são descartados.
        // (a intenção nunca fica setada nesse caso: o leitor suprime quando há thread)
        stripEmailContactParams();
        return;
      }
      if (!contactIntent || !activeAccount) return;
      // A intenção só vale enquanto os parâmetros estão na URL: se uma navegação
      // intermediária (ex.: abrir outra conversa) os removeu, não consome.
      if (!params.has('emailContact') && !params.has('emailTo')) return;
      if (contactIntent.contactId && contactThread.status === 'loading') return;

      stripEmailContactParams();
      const intent = contactIntent;
      setContactIntent(null);
      if (intent.contactId && contactThread.status === 'found' && contactThread.threadId) {
        navigateToThread(contactThread.threadId, true);
      } else {
        setComposerTo(intent.to ?? '');
        setShowComposer(true);
      }
    });
    return () => { alive = false; };
  }, [contactIntent, activeAccount, contactThread.status, contactThread.threadId, navigateToThread]);

  const toggleDetails = useCallback(() => {
    setShowDetails(open => {
      if (!open && document.activeElement instanceof HTMLElement) detailsTriggerRef.current = document.activeElement;
      return !open;
    });
  }, []);

  useEffect(() => {
    if (activeAccount && labels.length === 0 && !syncLabels.isPending) syncLabels.mutate();
    // Mutation object identity is not a data dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.id, labels.length]);

  if (accountsLoading) {
    return <section aria-label="Carregando Email" className="flex h-full items-center justify-center bg-background text-muted-foreground"><Loader2 className="mr-3 h-6 w-6 animate-spin text-primary" />Carregando suas contas de email…</section>;
  }

  if (accountsError) {
    return (
      <section role="alert" className="flex h-full flex-col items-center justify-center bg-background px-6 text-center text-foreground">
        <Mail className="mb-4 h-12 w-12 text-destructive" />
        <h2 className="text-lg font-semibold">{accountsErrorCopy.title}</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{accountsErrorCopy.description}</p>
        <Button className="mt-5" variant="outline" onClick={() => void refetchAccounts()}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button>
      </section>
    );
  }

  if (!activeAccount) {
    return (
      <section className="flex h-full w-full flex-col items-center justify-center bg-background px-6 py-16 text-foreground">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-glow-primary-sm"><Mail className="h-8 w-8 text-primary" /></div>
        <h1 className="text-xl font-semibold">Conecte seu Gmail ao ZAPP</h1>
        <p className="mb-6 mt-2 max-w-md text-center text-sm text-muted-foreground">Gerencie conversas, anexos, rascunhos e respostas em uma experiência única e segura.</p>
        <Button onClick={() => connectGmail.mutate()} disabled={connectGmail.isPending}>
          {connectGmail.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
          {connectGmail.isPending ? 'Conectando…' : 'Conectar Gmail'}
        </Button>
      </section>
    );
  }

  return (
    <section data-testid="email-workspace" aria-label="Email" className="email-workspace flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      {!embedded && <header data-testid="email-header" className="shrink-0 border-b border-border bg-inbox-panel px-4 py-3 shadow-header md:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-glow-primary-sm"><Mail className="h-6 w-6" /></div>
            <div className="min-w-0"><h1 className="text-xl font-semibold tracking-tight">Email</h1><p className="hidden text-xs text-muted-foreground sm:block">Comunicação profissional, organizada como uma conversa.</p></div>
          </div>
          <div className="relative order-3 hidden w-full flex-1 sm:block md:order-none md:ml-4 md:max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Busca global do Email" value={globalSearchQuery} onChange={event => setGlobalSearchQuery(event.target.value)} placeholder="Buscar e-mails, remetentes, assuntos, anexos…" className="h-10 border-input bg-input pl-10 text-foreground placeholder:text-muted-foreground focus-visible:ring-ring" />
          </div>
          {accounts.length > 1 && (
            <Select value={activeAccount.id} onValueChange={nextAccountId => { navigateToThread(null, true); setShowComposer(false); setComposerTo(''); setAccountId(nextAccountId); }}>
              <SelectTrigger aria-label="Conta de email ativa" className="hidden h-9 w-[220px] border-input bg-input text-xs lg:flex"><SelectValue /></SelectTrigger>
              <SelectContent>{accounts.filter(account => account.is_active).map(account => <SelectItem key={account.id} value={account.id}>{account.email_address}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button ref={helpButtonRef} variant="outline" onClick={() => setShowHelp(true)} className="ml-auto hidden sm:inline-flex"><CircleHelp className="mr-2 h-4 w-4" />Ajuda</Button>
          <Button onClick={() => { setComposerTo(''); setShowComposer(true); }}><Plus className="mr-2 h-4 w-4" />Nova mensagem</Button>
        </div>
        <div className="mt-2 flex items-center gap-2 text-2xs text-success"><Wifi className="h-3 w-3" />{activeAccount.email_address}<span className="text-border">•</span><span className="text-muted-foreground">{unreadCount} não {unreadCount === 1 ? 'lido' : 'lidos'}</span></div>
      </header>}

      {embedded && <div className="flex shrink-0 items-center gap-2 border-b border-border bg-inbox-panel px-3 py-2 text-xs text-foreground"><Mail className="h-4 w-4 text-primary" /><span className="font-medium">Email</span><span className="truncate text-muted-foreground">{activeAccount.email_address}</span><Button size="sm" className="ml-auto h-7 px-2 text-xs" onClick={() => { setComposerTo(''); setShowComposer(true); }}><Plus className="mr-1 h-3.5 w-3.5" />Nova mensagem</Button></div>}

      <div className="flex min-h-0 flex-1">
        <aside data-testid="email-thread-list" className={cn('w-full shrink-0 border-r border-border bg-inbox-panel md:w-[330px] xl:w-[370px]', selectedThread ? 'hidden md:flex md:flex-col' : 'flex flex-col')}>
          <EmailThreadList threads={threads} totalCount={threadsTotalCount} page={page} pageCount={threadsPageCount} threadsLoading={threadsLoading} threadsError={threadsError} labels={labels} unreadCount={unreadCount} filters={filters} onFiltersChange={updateFilters} onSearchChange={setSearch} onResetFilters={resetFilters} onPageChange={next => setPage(threadsLoading ? next : Math.min(next, Math.max(1, threadsPageCount)))} globalSearchQuery={globalSearchQuery} onClearGlobalSearch={() => setGlobalSearchQuery('')} selectedThreadId={selectedThread?.id || null} activeAccountEmail={activeAccount.email_address} onSelectThread={thread => navigateToThread(thread.id)} onNewEmail={() => { setComposerTo(''); setShowComposer(true); }} onSync={() => syncInbox.mutate({})} isSyncing={syncInbox.isPending} />
        </aside>
        <section data-testid="email-conversation" aria-label="Conteúdo da conversa" className={cn('min-w-0 flex-1 flex-col bg-background', !selectedThread ? 'hidden md:flex' : 'flex')}>
          {selectedThread ? <EmailChatThread key={`${activeAccount.id}:${selectedThread.id}`} accountId={activeAccount.id} thread={selectedThread} labels={labels} onContextDataChange={handleThreadContextChange} onBack={() => navigateToThread(null, true)} onToggleDetails={toggleDetails} showDetailsButton /> : (
            <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground"><div className="mb-4 rounded-2xl border border-border bg-card p-5"><Mail className="h-12 w-12 opacity-40" /></div><p className="text-sm font-medium text-foreground">Selecione uma conversa para começar</p><p className="mt-1 text-xs">A leitura e a resposta acontecerão no painel central.</p></div>
          )}
        </section>
        {selectedThread && showDetails && isWideDetailsLayout && <aside data-testid="email-contact-panel" className="w-80 shrink-0 border-l border-border"><EmailContactPanel key={`${activeAccount.id}:${selectedThread.id}:${selectedThread.contact_id ?? 'external'}`} accountId={activeAccount.id} accountEmail={activeAccount.email_address} thread={selectedThread} messages={threadContext.accountId === activeAccount.id ? threadContext.messages : []} attachments={threadContext.accountId === activeAccount.id ? threadContext.attachments : []} relatedThreads={threads.filter(item => item.id !== selectedThread.id && item.contact_id && item.contact_id === selectedThread.contact_id)} labels={labels} onClose={() => setShowDetails(false)} onCompose={email => { setComposerTo(email); setShowComposer(true); }} onSelectRelated={thread => navigateToThread(thread.id)} onDownloadAttachment={attachment => attachment.gmail_message_id && downloadAttachment.mutate({ ...attachment, gmail_message_id: attachment.gmail_message_id })} /></aside>}
      </div>
      {selectedThread && !isWideDetailsLayout && (
        <Sheet open={showDetails} onOpenChange={setShowDetails}>
          <SheetContent side="right" onCloseAutoFocus={event => { event.preventDefault(); detailsTriggerRef.current?.focus(); }} className="w-[min(92vw,360px)] border-border bg-inbox-panel p-0 text-foreground sm:max-w-[360px] [&>button]:hidden">
            <SheetTitle className="sr-only">Detalhes da conversa</SheetTitle>
            <EmailContactPanel key={`${activeAccount.id}:${selectedThread.id}:${selectedThread.contact_id ?? 'external'}`} accountId={activeAccount.id} accountEmail={activeAccount.email_address} thread={selectedThread} messages={threadContext.accountId === activeAccount.id ? threadContext.messages : []} attachments={threadContext.accountId === activeAccount.id ? threadContext.attachments : []} relatedThreads={threads.filter(item => item.id !== selectedThread.id && item.contact_id && item.contact_id === selectedThread.contact_id)} labels={labels} onClose={() => setShowDetails(false)} onCompose={email => { setComposerTo(email); setShowComposer(true); }} onSelectRelated={thread => navigateToThread(thread.id)} onDownloadAttachment={attachment => attachment.gmail_message_id && downloadAttachment.mutate({ ...attachment, gmail_message_id: attachment.gmail_message_id })} />
          </SheetContent>
        </Sheet>
      )}
      <AnimatePresence>{showComposer && <EmailComposer key={activeAccount.id} accountId={activeAccount.id} mode="new" defaultTo={composerTo} onClose={() => setShowComposer(false)} onSent={() => setShowComposer(false)} />}</AnimatePresence>
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent onCloseAutoFocus={event => { event.preventDefault(); helpButtonRef.current?.focus(); }} className="border-border bg-popover text-popover-foreground">
          <DialogHeader>
            <DialogTitle>Ajuda do Email</DialogTitle>
            <DialogDescription className="text-muted-foreground">Use a busca para localizar conversas, selecione uma conta quando houver mais de uma e abra uma thread para responder, encaminhar ou baixar anexos.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-foreground">Rascunhos são salvos automaticamente. Antes do envio, confira destinatários, assunto e anexos. Nenhuma confirmação de leitura é exibida porque o Gmail não fornece esse sinal ao módulo.</p>
        </DialogContent>
      </Dialog>
    </section>
  );
}
