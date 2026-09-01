import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  ArrowLeft, Star, Archive, Trash2, Loader2, Mail, PanelRightOpen, Pencil
} from 'lucide-react';
import { useGmail, type EmailThread, type EmailMessage } from '@/hooks/integrations/useGmail';
import { EmailChatBubble } from './EmailChatBubble';
import { EmailChatReplyBar } from './EmailChatReplyBar';
import { EmailComposer } from '@/components/gmail/EmailComposer';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface EmailChatThreadProps {
  thread: EmailThread;
  onBack: () => void;
  onToggleDetails?: () => void;
  showDetailsButton?: boolean;
}

function DateSeparator({ date }: { date: string }) {
  const d = new Date(date);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const label = isToday
    ? 'Hoje'
    : isYesterday
      ? 'Ontem'
      : format(d, "dd 'de' MMMM", { locale: ptBR });

  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-border/50" />
      <span className="text-[10px] text-muted-foreground font-medium px-2">{label}</span>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  );
}

export function EmailChatThread({ thread, onBack, onToggleDetails, showDetailsButton }: EmailChatThreadProps) {
  const {
    threadMessages, messagesLoading, markAsRead,
    trashThread, modifyLabels, setSelectedThreadId, activeAccount
  } = useGmail();

  const [replyMode, setReplyMode] = useState<'reply' | 'reply-all' | 'forward' | 'new'>('reply');
  const [showComposer, setShowComposer] = useState(false);
  const [composerMode, setComposerMode] = useState<'reply' | 'forward'>('reply');
  const [forwardMsg, setForwardMsg] = useState<EmailMessage | null>(null);
  // E40: rastrear se usuário está próximo do fim
  const [isNearBottom, setIsNearBottom] = useState(true);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedThreadId(thread.id);
    return () => setSelectedThreadId(null);
  }, [thread.id, setSelectedThreadId]);

  // Mark as read
  useEffect(() => {
    if (thread.is_unread && threadMessages.length > 0) {
      const unreadIds = threadMessages.filter(m => !m.is_read).map(m => m.gmail_message_id);
      if (unreadIds.length > 0) markAsRead.mutate(unreadIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadMessages.length, thread.is_unread]);

  // E39: scroll para o fim ao carregar a thread
  useEffect(() => {
    if (!messagesLoading && threadMessages.length > 0) {
      // Pequeno timeout para o DOM renderizar
      const t = window.setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      }, 50);
      return () => window.clearTimeout(t);
    }
  }, [thread.id]); // só na montagem (mudança de thread)

  // E40: scroll para o fim apenas quando próximo do fim
  useEffect(() => {
    if (isNearBottom && threadMessages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [threadMessages.length, isNearBottom]);

  // E40: detector de posição de scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsNearBottom(distanceFromBottom < 120);
  }, []);

  const lastMessage = useMemo(() => threadMessages[threadMessages.length - 1], [threadMessages]);

  const messagesWithDates = useMemo(() => {
    const result: Array<{ type: 'date'; date: string } | { type: 'message'; message: EmailMessage; isLast: boolean }> = [];
    let lastDate = '';
    threadMessages.forEach((msg, i) => {
      const msgDate = new Date(msg.internal_date).toDateString();
      if (msgDate !== lastDate) {
        result.push({ type: 'date', date: msg.internal_date });
        lastDate = msgDate;
      }
      result.push({ type: 'message', message: msg, isLast: i === threadMessages.length - 1 });
    });
    return result;
  }, [threadMessages]);

  const handleBubbleReply = useCallback(() => setReplyMode('reply'), []);
  const handleBubbleReplyAll = useCallback(() => setReplyMode('reply-all'), []);
  const handleBubbleForward = useCallback((msg: EmailMessage) => {
    setForwardMsg(msg);
    setComposerMode('forward');
    setShowComposer(true);
  }, []);

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-3 border-b flex items-center gap-3 bg-card/50 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack} aria-label="Voltar">
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold truncate">{thread.subject || '(Sem assunto)'}</h3>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {(thread.contact?.name || thread.last_from_name) && (
                <span className="truncate">{thread.contact?.name || thread.last_from_name}</span>
              )}
              <span>•</span>
              <span>{thread.message_count} msg</span>
              {thread.is_starred && <Star className="w-3 h-3 text-amber-500 fill-current" />}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {thread.tags.map(tag => (
              <Badge key={tag} variant="outline" className="text-[9px] px-1 py-0">{tag}</Badge>
            ))}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8" aria-label="Arquivar"
                  onClick={() => { if (lastMessage) modifyLabels.mutate({ message_id: lastMessage.gmail_message_id, remove_labels: ['INBOX'] }); onBack(); }}
                >
                  <Archive className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Arquivar</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                  onClick={() => { trashThread.mutate(thread.gmail_thread_id); onBack(); }}
                  aria-label="Excluir"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Excluir</TooltipContent>
            </Tooltip>
            {showDetailsButton && onToggleDetails && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleDetails} aria-label="Detalhes">
                    <PanelRightOpen className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Detalhes do contato</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Messages */}
        {/* E39/E40: usar onScroll diretamente no div interno do ScrollArea */}
        <ScrollArea className="flex-1">
          <div
            className="p-4"
            onScroll={handleScroll}
          >
            {messagesLoading ? (
              /* E42: skeletons em vez de spinner */
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className={cn('flex gap-2', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
                    {i % 2 === 0 && <Skeleton className="h-8 w-8 rounded-full shrink-0" />}
                    <div className="space-y-1.5 max-w-[60%]">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-16 w-full rounded-2xl" />
                    </div>
                    {i % 2 !== 0 && <Skeleton className="h-8 w-8 rounded-full shrink-0" />}
                  </div>
                ))}
              </div>
            ) : threadMessages.length === 0 ? (
              /* E41: estado vazio com ação */
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <Mail className="w-12 h-12 opacity-20" />
                <p className="text-sm">Nenhuma mensagem nesta thread</p>
                <button
                  onClick={() => { /* reply bar já está visível */ }}
                  className="text-xs text-primary hover:underline"
                >
                  Escrever resposta
                </button>
              </div>
            ) : (
              messagesWithDates.map((item, i) => {
                if (item.type === 'date') {
                  return <DateSeparator key={`date-${i}`} date={item.date} />;
                }
                return (
                  <EmailChatBubble
                    key={item.message.id}
                    message={item.message}
                    isLast={item.isLast}
                    onReply={handleBubbleReply}
                    onReplyAll={handleBubbleReplyAll}
                    onForward={handleBubbleForward}
                  />
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Reply bar */}
        <EmailChatReplyBar
          threadId={thread.gmail_thread_id}
          lastMessage={lastMessage}
          accountEmail={activeAccount?.email_address}
          mode={replyMode}
          onModeChange={setReplyMode}
          onSent={() => { /* invalidação via react-query */ }}
        />

        {showComposer && lastMessage && (
          <EmailComposer
            mode={composerMode}
            replyTo={lastMessage}
            threadId={thread.gmail_thread_id}
            onClose={() => setShowComposer(false)}
            onSent={() => setShowComposer(false)}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
