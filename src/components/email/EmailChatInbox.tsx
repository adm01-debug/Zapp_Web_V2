import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { CircleHelp, Loader2, Mail, Plus, RefreshCw, Search, Wifi } from 'lucide-react';
import { useGmail } from '@/hooks/integrations/useGmail';
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

interface EmailChatInboxProps {
  embedded?: boolean;
}

export function EmailChatInbox({ embedded = false }: EmailChatInboxProps) {
  const [accountId, setAccountId] = useState<string>();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('emailThread'));
  const {
    accounts, accountsLoading, accountsError, refetchAccounts, activeAccount,
    threads, threadsLoading, threadsError, connectGmail, labels, syncInbox,
    syncLabels, unreadCount, threadsTotalCount, subscribeToThreads, requestedThread, downloadAttachment,
  } = useGmail(accountId, selectedThreadId);
  const [showComposer, setShowComposer] = useState(false);
  const [composerTo, setComposerTo] = useState('');
  const [showDetails, setShowDetails] = useState(matchesWideDetailsLayout);
  const [isWideDetailsLayout, setIsWideDetailsLayout] = useState(matchesWideDetailsLayout);
  const [threadContext, setThreadContext] = useState<{ messages: EmailMessage[]; attachments: Array<EmailAttachment & { gmail_message_id?: string }> }>({ messages: [], attachments: [] });
  const detailsTriggerRef = useRef<HTMLElement | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
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

  useEffect(() => {
    const handlePopState = () => setSelectedThreadId(new URLSearchParams(window.location.search).get('emailThread'));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToThread = useCallback((threadId: string | null, replace = false) => {
    const url = new URL(window.location.href);
    if (threadId) url.searchParams.set('emailThread', threadId);
    else url.searchParams.delete('emailThread');
    window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
    setSelectedThreadId(threadId);
    setThreadContext({ messages: [], attachments: [] });
    if (threadId) setShowDetails(matchesWideDetailsLayout());
  }, []);

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
    return <section aria-label="Carregando Email" className="flex h-full items-center justify-center bg-[#03111f] text-slate-300"><Loader2 className="mr-3 h-6 w-6 animate-spin text-blue-400" />Carregando suas contas de email…</section>;
  }

  if (accountsError) {
    return (
      <section role="alert" className="flex h-full flex-col items-center justify-center bg-[#03111f] px-6 text-center text-slate-200">
        <Mail className="mb-4 h-12 w-12 text-red-400" />
        <h2 className="text-lg font-semibold">{accountsErrorCopy.title}</h2>
        <p className="mt-2 max-w-md text-sm text-slate-400">{accountsErrorCopy.description}</p>
        <Button className="mt-5" variant="outline" onClick={() => void refetchAccounts()}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button>
      </section>
    );
  }

  if (!activeAccount) {
    return (
      <section className="flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_top,#0a3154_0%,#03111f_48%,#020b14_100%)] px-6 py-16 text-slate-100">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-400/30 bg-blue-500/15 shadow-[0_0_36px_rgba(37,99,235,.2)]"><Mail className="h-8 w-8 text-blue-300" /></div>
        <h1 className="text-xl font-semibold">Conecte seu Gmail ao ZAPP</h1>
        <p className="mb-6 mt-2 max-w-md text-center text-sm text-slate-400">Gerencie conversas, anexos, rascunhos e respostas em uma experiência única e segura.</p>
        <Button onClick={() => connectGmail.mutate()} disabled={connectGmail.isPending} className="bg-blue-600 hover:bg-blue-500">
          {connectGmail.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
          {connectGmail.isPending ? 'Conectando…' : 'Conectar Gmail'}
        </Button>
      </section>
    );
  }

  return (
    <section aria-label="Email" className="email-navy flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#03111f] text-slate-100">
      {!embedded && <header className="shrink-0 border-b border-cyan-300/10 bg-[linear-gradient(110deg,#041522_0%,#06233a_55%,#061a2d_100%)] px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,.18)] md:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 shadow-[0_0_24px_rgba(37,99,235,.35)]"><Mail className="h-6 w-6" /></div>
            <div className="min-w-0"><h1 className="text-xl font-semibold tracking-tight">Email</h1><p className="hidden text-xs text-slate-400 sm:block">Comunicação profissional, organizada como uma conversa.</p></div>
          </div>
          <div className="relative order-3 hidden w-full flex-1 sm:block md:order-none md:ml-4 md:max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input aria-label="Busca global do Email" value={globalSearchQuery} onChange={event => setGlobalSearchQuery(event.target.value)} placeholder="Buscar e-mails, remetentes, assuntos, anexos…" className="h-10 border-cyan-300/10 bg-[#071d30]/80 pl-10 text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-500" />
          </div>
          {accounts.length > 1 && (
            <Select value={activeAccount.id} onValueChange={nextAccountId => { navigateToThread(null, true); setShowComposer(false); setComposerTo(''); setAccountId(nextAccountId); }}>
              <SelectTrigger aria-label="Conta de email ativa" className="hidden h-9 w-[220px] border-cyan-300/10 bg-[#071d30] text-xs lg:flex"><SelectValue /></SelectTrigger>
              <SelectContent>{accounts.filter(account => account.is_active).map(account => <SelectItem key={account.id} value={account.id}>{account.email_address}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button ref={helpButtonRef} variant="outline" onClick={() => setShowHelp(true)} className="ml-auto hidden border-blue-400/30 bg-transparent text-slate-200 hover:bg-blue-500/10 hover:text-white sm:inline-flex"><CircleHelp className="mr-2 h-4 w-4" />Ajuda</Button>
          <Button onClick={() => { setComposerTo(''); setShowComposer(true); }} className="bg-blue-600 shadow-[0_0_18px_rgba(37,99,235,.25)] hover:bg-blue-500"><Plus className="mr-2 h-4 w-4" />Nova mensagem</Button>
        </div>
        <div className="mt-2 flex items-center gap-2 text-2xs text-emerald-300/90"><Wifi className="h-3 w-3" />{activeAccount.email_address}<span className="text-slate-600">•</span><span className="text-slate-400">{unreadCount} não {unreadCount === 1 ? 'lido' : 'lidos'}</span></div>
      </header>}

      {embedded && <div className="flex shrink-0 items-center gap-2 border-b border-cyan-300/10 bg-[#041522] px-3 py-2 text-xs text-slate-300"><Mail className="h-4 w-4 text-blue-400" /><span className="font-medium">Email</span><span className="truncate text-slate-500">{activeAccount.email_address}</span><Button size="sm" className="ml-auto h-7 bg-blue-600 px-2 text-xs hover:bg-blue-500" onClick={() => { setComposerTo(''); setShowComposer(true); }}><Plus className="mr-1 h-3.5 w-3.5" />Nova mensagem</Button></div>}

      <div className="flex min-h-0 flex-1">
        <aside className={cn('w-full shrink-0 border-r border-cyan-300/10 bg-[#041421] md:w-[330px] xl:w-[370px]', selectedThread ? 'hidden md:flex md:flex-col' : 'flex flex-col')}>
          <EmailThreadList threads={threads} totalCount={threadsTotalCount} threadsLoading={threadsLoading} threadsError={threadsError} labels={labels} unreadCount={unreadCount} globalSearchQuery={globalSearchQuery} onClearGlobalSearch={() => setGlobalSearchQuery('')} selectedThreadId={selectedThread?.id || null} activeAccountEmail={activeAccount.email_address} onSelectThread={thread => navigateToThread(thread.id)} onNewEmail={() => { setComposerTo(''); setShowComposer(true); }} onSync={() => syncInbox.mutate({})} isSyncing={syncInbox.isPending} />
        </aside>
        <section aria-label="Conteúdo da conversa" className={cn('min-w-0 flex-1 flex-col bg-[radial-gradient(circle_at_45%_20%,#082641_0%,#03111f_50%,#020c16_100%)]', !selectedThread ? 'hidden md:flex' : 'flex')}>
          {selectedThread ? <EmailChatThread key={`${activeAccount.id}:${selectedThread.id}`} accountId={activeAccount.id} thread={selectedThread} labels={labels} onContextDataChange={setThreadContext} onBack={() => navigateToThread(null, true)} onToggleDetails={toggleDetails} showDetailsButton /> : (
            <div className="flex flex-1 flex-col items-center justify-center text-slate-500"><div className="mb-4 rounded-2xl border border-cyan-300/10 bg-[#06192a] p-5"><Mail className="h-12 w-12 opacity-40" /></div><p className="text-sm font-medium text-slate-300">Selecione uma conversa para começar</p><p className="mt-1 text-xs">A leitura e a resposta acontecerão no painel central.</p></div>
          )}
        </section>
        {selectedThread && showDetails && isWideDetailsLayout && <aside className="shrink-0 border-l border-cyan-300/10"><EmailContactPanel thread={selectedThread} messages={threadContext.messages} attachments={threadContext.attachments} relatedThreads={threads.filter(item => item.id !== selectedThread.id && item.contact_id && item.contact_id === selectedThread.contact_id).slice(0, 5)} labels={labels} onClose={() => setShowDetails(false)} onCompose={email => { setComposerTo(email); setShowComposer(true); }} onSelectRelated={thread => navigateToThread(thread.id)} onDownloadAttachment={attachment => attachment.gmail_message_id && downloadAttachment.mutate({ ...attachment, gmail_message_id: attachment.gmail_message_id })} /></aside>}
      </div>
      {selectedThread && !isWideDetailsLayout && (
        <Sheet open={showDetails} onOpenChange={setShowDetails}>
          <SheetContent side="right" onCloseAutoFocus={event => { event.preventDefault(); detailsTriggerRef.current?.focus(); }} className="w-[min(92vw,360px)] border-cyan-300/15 bg-[#041421] p-0 text-slate-100 sm:max-w-[360px] [&>button]:hidden">
            <SheetTitle className="sr-only">Detalhes da conversa</SheetTitle>
            <EmailContactPanel thread={selectedThread} messages={threadContext.messages} attachments={threadContext.attachments} relatedThreads={threads.filter(item => item.id !== selectedThread.id && item.contact_id && item.contact_id === selectedThread.contact_id).slice(0, 5)} labels={labels} onClose={() => setShowDetails(false)} onCompose={email => { setComposerTo(email); setShowComposer(true); }} onSelectRelated={thread => navigateToThread(thread.id)} onDownloadAttachment={attachment => attachment.gmail_message_id && downloadAttachment.mutate({ ...attachment, gmail_message_id: attachment.gmail_message_id })} />
          </SheetContent>
        </Sheet>
      )}
      <AnimatePresence>{showComposer && <EmailComposer key={activeAccount.id} accountId={activeAccount.id} mode="new" defaultTo={composerTo} onClose={() => setShowComposer(false)} onSent={() => setShowComposer(false)} />}</AnimatePresence>
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent onCloseAutoFocus={event => { event.preventDefault(); helpButtonRef.current?.focus(); }} className="border-cyan-300/15 bg-[#061827] text-slate-100">
          <DialogHeader>
            <DialogTitle>Ajuda do Email</DialogTitle>
            <DialogDescription className="text-slate-400">Use a busca para localizar conversas, selecione uma conta quando houver mais de uma e abra uma thread para responder, encaminhar ou baixar anexos.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-slate-300">Rascunhos são salvos automaticamente. Antes do envio, confira destinatários, assunto e anexos. Nenhuma confirmação de leitura é exibida porque o Gmail não fornece esse sinal ao módulo.</p>
        </DialogContent>
      </Dialog>
    </section>
  );
}
