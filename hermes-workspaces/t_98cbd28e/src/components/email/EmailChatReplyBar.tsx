import { useState, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Send, Paperclip, X, Loader2, Reply, ReplyAll, Forward, ChevronDown
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useGmail, type EmailMessage } from '@/hooks/integrations/useGmail';
import { toast } from 'sonner';
import { fileToEmailAttachment, formatEmailFileSize, validateEmailAttachments } from '@/lib/emailAttachments';
import { invalidEmailTokens, parseEmailAddressList, prefixEmailSubject, resolveReplyRecipients } from '@/lib/emailRecipients';

import { getLogger } from '@/lib/logger';
const log = getLogger('EmailChatReplyBar');

interface EmailChatReplyBarProps {
  accountId?: string;
  threadId: string;
  lastMessage: EmailMessage | null;
  accountEmail?: string;
  mode: 'reply' | 'reply-all' | 'forward' | 'new';
  onModeChange: (mode: 'reply' | 'reply-all' | 'forward' | 'new') => void;
  onSent?: () => void;
}

export function EmailChatReplyBar({
  accountId,
  threadId,
  lastMessage,
  accountEmail,
  mode,
  onModeChange,
  onSent,
}: EmailChatReplyBarProps) {
  const { sendEmail, replyEmail } = useGmail(accountId);

  const [body, setBody] = useState('');
  const [to, setTo] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [newSubject, setNewSubject] = useState(''); // E26
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendLockRef = useRef(false);

  const isSending = sendEmail.isPending || replyEmail.isPending;

  // Resolve recipients based on mode
  const replyRecipients = useMemo(
    () => lastMessage && (mode === 'reply' || mode === 'reply-all')
      ? resolveReplyRecipients(lastMessage, mode === 'reply-all' ? 'reply-all' : 'reply', accountEmail)
      : { to: [], cc: [] },
    [accountEmail, lastMessage, mode],
  );
  const resolvedTo = mode === 'forward' || mode === 'new' ? to : replyRecipients.to.join(', ');

  const handleAddFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const next = [...attachments, ...Array.from(files)];
    const error = validateEmailAttachments(next);
    if (error) toast.error(error);
    else setAttachments(next);
  }, [attachments]);

  const handleSend = async () => {
    if (sendLockRef.current || (!body.trim() && attachments.length === 0)) return;
    const target = resolvedTo || to;
    if (!target.trim()) {
      toast.error('Informe o destinatário');
      return;
    }

    const invalid = invalidEmailTokens(target);
    if (invalid.length > 0) {
      toast.error(`Revise os destinatários inválidos: ${invalid.join(', ')}`);
      return;
    }
    const toAddresses = parseEmailAddressList(target);
    const toPayload = toAddresses.length === 1 ? toAddresses[0] : toAddresses;
    if (toAddresses.length === 0) {
      toast.error('Informe ao menos um destinatário válido.');
      return;
    }
    const attachmentError = validateEmailAttachments(attachments);
    if (attachmentError) {
      toast.error(attachmentError);
      return;
    }

    sendLockRef.current = true;
    // R2-COM-005: fotografa o que está sendo enviado. Ao concluir, só limpa o campo que
    // o usuário NÃO alterou durante o envio — o texto digitado no meio do envio (ou um
    // novo destinatário/anexo) permanece no editor, nada é descartado em silêncio.
    const sentBody = body;
    const sentTo = to;
    const sentAttachments = attachments;
    try {
      // Convert attachments to base64
      const base64Attachments = await Promise.all(attachments.map(fileToEmailAttachment));

      if ((mode === 'reply' || mode === 'reply-all') && lastMessage) {
        await replyEmail.mutateAsync({
          thread_id: threadId,
          message_id: lastMessage.gmail_message_id,
          to: toPayload,
          text_body: body,
          cc: replyRecipients.cc.length ? replyRecipients.cc : undefined,
          attachments: base64Attachments.length > 0 ? base64Attachments : undefined,
        });
      } else if (mode === 'forward') {
        const fwdBody = lastMessage
          ? `${body}\n\n---------- Mensagem encaminhada ----------\nDe: ${lastMessage.from_name || lastMessage.from_address}\n\n${lastMessage.body_text || lastMessage.snippet}`
          : body;
        await sendEmail.mutateAsync({
          to: toPayload,
          subject: lastMessage ? prefixEmailSubject(lastMessage.subject, 'Fwd') : '',
          text_body: fwdBody,
          attachments: base64Attachments.length > 0 ? base64Attachments : undefined,
        });
      } else {
        if (!newSubject?.trim()) { toast.error('Informe o assunto do e-mail'); return; }
        await sendEmail.mutateAsync({
          to: toPayload,
          subject: newSubject.trim(),
          text_body: body,
          attachments: base64Attachments.length > 0 ? base64Attachments : undefined,
        });
      }

      setBody((prev) => (prev === sentBody ? '' : prev));
      setTo((prev) => (prev === sentTo ? '' : prev));
      setAttachments((prev) => (prev === sentAttachments ? [] : prev));
      onSent?.();
    } catch (err) {
      log.error('Unexpected error in EmailChatReplyBar:', err);
    } finally {
      sendLockRef.current = false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSend();
    }
  };

  const modeLabel = {
    'reply': 'Responder',
    'reply-all': 'Responder a todos',
    'forward': 'Encaminhar',
    'new': 'Nova mensagem',
  };

  const modeIcon = {
    'reply': Reply,
    'reply-all': ReplyAll,
    'forward': Forward,
    'new': Send,
  };

  const ModeIcon = modeIcon[mode];

  return (
    <div className="space-y-2 border-t border-border bg-inbox-panel p-3">
      {/* Mode selector + forward destination */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1 text-3xs">
              <ModeIcon className="w-3 h-3" />
              {modeLabel[mode]}
              <ChevronDown className="w-2.5 h-2.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onModeChange('reply')}>
              <Reply className="w-3.5 h-3.5 mr-2" /> Responder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onModeChange('reply-all')}>
              <ReplyAll className="w-3.5 h-3.5 mr-2" /> Responder a todos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onModeChange('forward')}>
              <Forward className="w-3.5 h-3.5 mr-2" /> Encaminhar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {(mode === 'forward' || mode === 'new') && (
          <Input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="email@destinatario.com"
            className="h-7 flex-1 border-input bg-input text-xs text-foreground"
          />
        )}

        {(mode === 'reply' || mode === 'reply-all') && resolvedTo && (
          <span className="text-3xs text-muted-foreground truncate flex-1">
            para: {resolvedTo}{mode === 'reply-all' && replyRecipients.cc.length > 0 ? ` · cc: ${replyRecipients.cc.join(', ')}` : ''}
          </span>
        )}
      </div>

      {mode === 'new' && <Input value={newSubject} onChange={(event) => setNewSubject(event.target.value)} placeholder="Assunto do email" className="h-8 border-input bg-input text-xs text-foreground" />}

      {/* Input area */}
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'forward' ? 'Adicione uma mensagem...' : 'Digite sua resposta...'}
            aria-describedby="email-reply-shortcut"
            className="min-h-[52px] max-h-[200px] resize-none border-input bg-input pr-10 text-sm text-foreground placeholder:text-muted-foreground"
            rows={1}
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 bottom-1 h-7 w-7"
            onClick={() => fileRef.current?.click()}
            aria-label="Anexar arquivo"
          >
            <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              handleAddFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        <Button
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full"
          onClick={handleSend}
          disabled={(!body.trim() && attachments.length === 0) || isSending || (!resolvedTo && !to.trim())}
          aria-label="Enviar"
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
      <p id="email-reply-shortcut" className="sr-only">Use Control ou Command mais Enter para enviar. Enter cria uma nova linha.</p>

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((f, i) => (
            <Badge key={i} variant="secondary" className="text-3xs gap-1 py-0.5 max-w-[180px]">
              <Paperclip className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{f.name}</span>
              <span className="text-muted-foreground shrink-0">({formatEmailFileSize(f.size)})</span>
              <button
                onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                aria-label={`Remover ${f.name}`}
                className="ml-0.5 hover:text-destructive"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </Badge>
          ))}
          <span className="text-[9px] text-muted-foreground self-center">
            {formatEmailFileSize(attachments.reduce((s, f) => s + f.size, 0))} / 25 MB
          </span>
        </div>
      )}
    </div>
  );
}
