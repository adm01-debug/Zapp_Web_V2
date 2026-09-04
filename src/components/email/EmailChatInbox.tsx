import { useState, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Loader2, Mail } from 'lucide-react';
import { useGmail, type EmailThread } from '@/hooks/integrations/useGmail';
import { EmailThreadList } from './EmailThreadList';
import { EmailChatThread } from './EmailChatThread';
import { EmailContactPanel } from './EmailContactPanel';
import { EmailComposer } from '@/components/gmail/EmailComposer';
import { cn } from '@/lib/utils';

export function EmailChatInbox() {
  const {
    activeAccount, threads, threadsLoading, connectGmail,
    labels, syncInbox, syncLabels, unreadCount, subscribeToThreads
  } = useGmail();

  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [showDetails, setShowDetails] = useState(true);

  useEffect(() => {
    const unsub = subscribeToThreads();
    return unsub;
  }, [subscribeToThreads]);

  useEffect(() => {
    if (activeAccount && labels.length === 0) {
      syncLabels.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.id]);

  // No account
  if (!activeAccount) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full py-16 px-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
          <Mail className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2 text-foreground">Gmail não conectado</h3>
        <p className="text-sm text-muted-foreground text-center max-w-xs mb-6">
          Conecte sua conta Gmail para gerenciar e-mails diretamente pela plataforma, com interface de chat.
        </p>
        <button
          onClick={() => connectGmail.mutate()}
          disabled={connectGmail.isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {connectGmail.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
          {connectGmail.isPending ? 'Conectando…' : 'Conectar Gmail'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      {/* Thread list */}
      <div className={cn(
        'flex flex-col border-r border-border/30 w-full md:w-[300px] xl:w-[340px] shrink-0 bg-sidebar',
        selectedThread ? 'hidden md:flex' : 'flex'
      )}>
        <EmailThreadList
          threads={threads}
          threadsLoading={threadsLoading}
          labels={labels}
          unreadCount={unreadCount}
          selectedThreadId={selectedThread?.id || null}
          activeAccountEmail={activeAccount.email_address}
          onSelectThread={setSelectedThread}
          onNewEmail={() => setShowComposer(true)}
          onSync={() => syncInbox.mutate({})}
          isSyncing={syncInbox.isPending}
        />
      </div>

      {/* Chat thread view */}
      <div className={cn(
        'flex-1 flex flex-col min-w-0',
        !selectedThread ? 'hidden md:flex' : 'flex'
      )}>
        {selectedThread ? (
          <EmailChatThread
            thread={selectedThread}
            onBack={() => setSelectedThread(null)}
            onToggleDetails={() => setShowDetails(prev => !prev)}
            showDetailsButton
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <Mail className="w-16 h-16 mb-4 opacity-10" />
            <p className="text-sm">Selecione uma conversa para começar</p>
          </div>
        )}
      </div>

      {/* Contact details panel */}
      {selectedThread && showDetails && (
        <div className="hidden lg:block shrink-0">
          <EmailContactPanel
            thread={selectedThread}
            onClose={() => setShowDetails(false)}
          />
        </div>
      )}

      {/* Composer */}
      <AnimatePresence>
        {showComposer && (
          <EmailComposer
            mode="new"
            onClose={() => setShowComposer(false)}
            onSent={() => setShowComposer(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
