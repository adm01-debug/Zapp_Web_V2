import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  ArrowDown, ArrowLeft, Star, Archive, Trash2, Loader2, Mail, PanelRightOpen, Reply, RotateCcw, Tags, X
} from 'lucide-react';
import { useGmail, type EmailAttachment, type EmailLabel, type EmailThread, type EmailMessage } from '@/hooks/integrations/useGmail';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmailChatBubble } from './EmailChatBubble';
import { EmailChatReplyBar } from './EmailChatReplyBar';
import { EmailComposer } from '@/components/gmail/EmailComposer';
import { EmailAttachmentPreviewDialog } from './EmailAttachmentPreviewDialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { emailLoadErrorCopy } from '@/lib/emailErrorState';

interface EmailChatThreadProps {
  accountId?: string;
  thread: EmailThread;
  onBack: () => void;
  onToggleDetails?: () => void;
  showDetailsButton?: boolean;
  labels?: EmailLabel[];
  onContextDataChange?: (data: { messages: EmailMessage[]; attachments: Array<EmailAttachment & { gmail_message_id?: string }> }) => void;
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
      <span className="text-3xs text-muted-foreground font-medium px-2">{label}</span>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  );
}

function preferredScrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined') return 'auto';
  const reduced = document.documentElement.classList.contains('reduced-motion')
    || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  return reduced ? 'auto' : 'smooth';
}

export function EmailChatThread({ accountId, thread, onBack, onToggleDetails, showDetailsButton, labels = [], onContextDataChange }: EmailChatThreadProps) {
  const {
    threadMessages, messagesLoading, messagesError, threadAttachments, markAsRead,
    trashThread, modifyThreadLabels, downloadAttachment, getAttachmentContent, setSelectedThreadId, activeAccount
  } = useGmail(accountId);

  const [replyMode, setReplyMode] = useState<'reply' | 'reply-all' | 'forward' | 'new'>('reply');
  const [showComposer, setShowComposer] = useState(false);
  const [composerMode, setComposerMode] = useState<'reply' | 'forward'>('reply');
  const [forwardMsg, setForwardMsg] = useState<EmailMessage | null>(null); // E33
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const [hasNewMessagesBelow, setHasNewMessagesBelow] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<(typeof threadAttachments)[number] | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const messagesErrorCopy = useMemo(() => emailLoadErrorCopy(messagesError), [messagesError]);

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

  // Preserve reading position when the user is inspecting an older message.
  useEffect(() => {
    const previousCount = previousMessageCountRef.current;
    const receivedNewMessage = threadMessages.length > previousCount;
    if (receivedNewMessage) {
      if (previousCount === 0 || nearBottomRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: preferredScrollBehavior() });
        setHasNewMessagesBelow(false);
      } else {
        setHasNewMessagesBelow(true);
      }
    }
    previousMessageCountRef.current = threadMessages.length;
  }, [threadMessages.length]);

  useEffect(() => {
    const viewport = messagesAreaRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
    if (!viewport) return;
    const update = () => {
      nearBottomRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 96;
      if (nearBottomRef.current) setHasNewMessagesBelow(false);
    };
    viewport.addEventListener('scroll', update, { passive: true });
    return () => viewport.removeEventListener('scroll', update);
  }, [thread.id]);

  const lastMessage = useMemo(() => threadMessages[threadMessages.length - 1], [threadMessages]);
  const replyTarget = useMemo(
    () => (replyTargetId ? threadMessages.find(message => message.id === replyTargetId) : null) ?? lastMessage,
    [lastMessage, replyTargetId, threadMessages],
  );
  const forwardedAttachments = useMemo(
    () => forwardMsg ? threadAttachments.filter(attachment => attachment.email_message_id === forwardMsg.id).map(attachment => ({ ...attachment, gmail_message_id: forwardMsg.gmail_message_id })) : [],
    [forwardMsg, threadAttachments],
  );
  const contextualAttachments = useMemo(
    () => threadAttachments.map(attachment => ({
      ...attachment,
      gmail_message_id: threadMessages.find(message => message.id === attachment.email_message_id)?.gmail_message_id,
    })),
    [threadAttachments, threadMessages],
  );

  useEffect(() => {
    onContextDataChange?.({ messages: threadMessages, attachments: contextualAttachments });
  }, [contextualAttachments, onContextDataChange, threadMessages]);

  // Group messages by date for separators
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

  const handleBubbleReply = useCallback((message: EmailMessage) => {
    setReplyTargetId(message.id);
    setReplyMode('reply');
  }, []);

  const handleBubbleReplyAll = useCallback((message: EmailMessage) => {
    setReplyTargetId(message.id);
    setReplyMode('reply-all');
  }, []);

  const handleBubbleForward = useCallback((msg: EmailMessage) => {
    setForwardMsg(msg); // E33: registrar mensagem a encaminhar
    setComposerMode('forward');
    setShowComposer(true);
  }, []);

  const handleReplySent = useCallback(() => {
    // Refresh will happen via react-query invalidation
  }, []);

  const archiveThread = useCallback(async () => {
    await modifyThreadLabels.mutateAsync({ thread_id: thread.gmail_thread_id, remove_labels: ['INBOX'] });
    onBack();
  }, [modifyThreadLabels, onBack, thread.gmail_thread_id]);

  const deleteThread = useCallback(async () => {
    await trashThread.mutateAsync(thread.gmail_thread_id);
    onBack();
  }, [onBack, thread.gmail_thread_id, trashThread]);

  const restoreThread = useCallback(async () => {
    await modifyThreadLabels.mutateAsync({ thread_id: thread.gmail_thread_id, add_labels: ['INBOX'], remove_labels: ['TRASH'] });
    onBack();
  }, [modifyThreadLabels, onBack, thread.gmail_thread_id]);

  const openAttachmentPreview = useCallback(async (attachment: (typeof threadAttachments)[number], gmailMessageId: string) => {
    setPreviewAttachment(attachment);
    setPreviewContent(null);
    try {
      const content = await getAttachmentContent({ ...attachment, gmail_message_id: gmailMessageId });
      setPreviewContent(content);
    } catch {
      setPreviewAttachment(null);
      toast.error('Não foi possível abrir a prévia deste anexo.');
    }
  }, [getAttachmentContent]);

  return (
    <TooltipProvider>
      <div className="relative flex h-full flex-col text-foreground">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border bg-inbox-panel p-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack} aria-label="Voltar">
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div className="flex-1 min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">{thread.subject || '(Sem assunto)'}</h3>
            <div className="flex items-center gap-2 text-3xs text-muted-foreground">
              {thread.contact && <span className="truncate">{thread.contact.name}</span>}
              <span>•</span>
              <span>{thread.message_count} msg</span>
              {thread.is_starred && <Star className="w-3 h-3 text-accent-foreground fill-current" />}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {thread.tags.map(tag => (
              <Badge key={tag} variant="outline" className="text-[9px] px-1 py-0">{tag}</Badge>
            ))}
            {labels.some(label => label.label_type === 'user') && (
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Gerenciar marcadores"><Tags className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Marcadores</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="max-h-72 w-64 overflow-y-auto border-border bg-popover text-popover-foreground">
                  <DropdownMenuLabel>Marcadores do Gmail</DropdownMenuLabel>
                  {labels.filter(label => label.label_type === 'user').map(label => {
                    const checked = thread.label_ids.includes(label.gmail_label_id);
                    return (
                      <DropdownMenuCheckboxItem
                        key={label.id}
                        checked={checked}
                        disabled={modifyThreadLabels.isPending}
                        onSelect={event => event.preventDefault()}
                        onCheckedChange={() => modifyThreadLabels.mutate({
                          thread_id: thread.gmail_thread_id,
                          ...(checked ? { remove_labels: [label.gmail_label_id] } : { add_labels: [label.gmail_label_id] }),
                        })}
                      >
                        {label.name}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={thread.is_starred ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                  onClick={() => modifyThreadLabels.mutate({ thread_id: thread.gmail_thread_id, ...(thread.is_starred ? { remove_labels: ['STARRED'] } : { add_labels: ['STARRED'] }) })}
                >
                  <Star className={cn('w-4 h-4', thread.is_starred && 'fill-warning text-warning')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{thread.is_starred ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}</TooltipContent>
            </Tooltip>
            {thread.label_ids.includes('TRASH') ? (
              <Tooltip>
                <TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Restaurar da lixeira" onClick={() => void restoreThread()} disabled={modifyThreadLabels.isPending}><RotateCcw className="h-4 w-4" /></Button></TooltipTrigger>
                <TooltipContent>Restaurar da lixeira</TooltipContent>
              </Tooltip>
            ) : (
              <>
                <Tooltip>
                  <TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Arquivar" onClick={() => void archiveThread()} disabled={modifyThreadLabels.isPending}><Archive className="h-4 w-4" /></Button></TooltipTrigger>
                  <TooltipContent>Arquivar</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => void deleteThread()} disabled={trashThread.isPending} aria-label="Mover para lixeira"><Trash2 className="h-4 w-4" /></Button></TooltipTrigger>
                  <TooltipContent>Mover para lixeira</TooltipContent>
                </Tooltip>
              </>
            )}
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

        {/* Messages as chat bubbles */}
        <ScrollArea ref={messagesAreaRef} className="flex-1 bg-background">
          <div className="p-4">
            {messagesLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : messagesError ? (
              <div role="alert" className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <Mail className="mb-3 h-10 w-10 text-destructive/80" />
                <p className="text-sm font-medium text-foreground">{messagesErrorCopy.title}</p>
                <p className="mt-1 text-xs">{messagesErrorCopy.description}</p>
              </div>
            ) : threadMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Mail className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm">Nenhuma mensagem</p>
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
                    showSubject={Boolean(item.message.subject && item.message.subject !== thread.subject)}
                    onReply={handleBubbleReply}
                    onReplyAll={handleBubbleReplyAll}
                    onForward={handleBubbleForward}
                    attachments={threadAttachments.filter(attachment => attachment.email_message_id === item.message.id)}
                    downloadingAttachmentId={downloadAttachment.isPending ? downloadAttachment.variables?.id : undefined}
                    onDownloadAttachment={attachment => downloadAttachment.mutate({ ...attachment, gmail_message_id: item.message.gmail_message_id })}
                    onPreviewAttachment={attachment => void openAttachmentPreview(attachment, item.message.gmail_message_id)}
                  />
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {hasNewMessagesBelow && (
          <Button
            type="button"
            size="sm"
            className="absolute bottom-20 left-1/2 z-10 -translate-x-1/2 rounded-full shadow-lg"
            onClick={() => { messagesEndRef.current?.scrollIntoView({ behavior: preferredScrollBehavior() }); setHasNewMessagesBelow(false); }}
          >
            <ArrowDown className="mr-1.5 h-4 w-4" />Novas mensagens
          </Button>
        )}

        {replyTargetId && replyTarget && replyTarget.id !== lastMessage?.id && (
          <div className="flex items-center gap-2 border-t border-primary/20 bg-primary/10 px-3 py-2 text-xs text-foreground" role="status">
            <Reply className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">Respondendo à mensagem de {replyTarget.from_name || replyTarget.from_address}, enviada em {format(new Date(replyTarget.internal_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.</span>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReplyTargetId(null)} aria-label="Responder à mensagem mais recente"><X className="h-3.5 w-3.5" /></Button>
          </div>
        )}

        {/* Reply bar */}
        <EmailChatReplyBar
          accountId={accountId}
          threadId={thread.gmail_thread_id}
          lastMessage={replyTarget}
          accountEmail={activeAccount?.email_address}
          mode={replyMode}
          onModeChange={setReplyMode}
          onSent={handleReplySent}
        />

        {/* Full composer for forward */}
        {showComposer && forwardMsg && (
          <EmailComposer
            accountId={accountId}
            mode={composerMode}
            replyTo={forwardMsg}
            forwardAttachments={forwardedAttachments}
            threadId={thread.gmail_thread_id}
            onClose={() => setShowComposer(false)}
            onSent={() => setShowComposer(false)}
          />
        )}
        <EmailAttachmentPreviewDialog open={Boolean(previewAttachment)} onOpenChange={open => { if (!open) { setPreviewAttachment(null); setPreviewContent(null); } }} attachment={previewAttachment} contentBase64={previewContent} />
      </div>
    </TooltipProvider>
  );
}
