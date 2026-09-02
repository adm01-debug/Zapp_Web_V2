import { useState, useRef, useCallback } from 'react';
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

import { getLogger } from '@/lib/logger';
const log = getLogger('EmailChatReplyBar');

interface EmailChatReplyBarProps {
  threadId: string;
  lastMessage: EmailMessage | null;
  accountEmail?: string;
  mode: 'reply' | 'reply-all' | 'forward' | 'new';
  onModeChange: (mode: 'reply' | 'reply-all' | 'forward' | 'new') => void;
  onSent?: () => void;
}

// Convert File to base64 string for Gmail API
function fileToBase64(file: File): Promise<{ filename: string; mimeType: string; content: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve({ filename: file.name, mimeType: file.type || 'application/octet-stream', content: base64 });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25MB Gmail limit

export function EmailChatReplyBar({
  threadId,
  lastMessage,
  accountEmail,
  mode,
  onModeChange,
  onSent,
}: EmailChatReplyBarProps) {
  const { sendEmail, replyEmail } = useGmail();

  const [body, setBody] = useState('');
  const [to, setTo] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [newSubject, setNewSubject] = useState(''); // E26
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isSending = sendEmail.isPending || replyEmail.isPending;

  // Resolve recipients based on mode
  const resolvedTo = (() => {
    if (mode === 'forward') return to;
    if (!lastMessage) return '';
    if (mode === 'reply-all') {
      // Collect all addresses except self
      const allAddrs = new Set<string>();
      if (lastMessage.direction === 'inbound') {
        allAddrs.add(lastMessage.from_address);
        lastMessage.to_addresses?.forEach(a => allAddrs.add(a));
        lastMessage.cc_addresses?.forEach(a => allAddrs.add(a));
      } else {
        lastMessage.to_addresses?.forEach(a => allAddrs.add(a));
        lastMessage.cc_addresses?.forEach(a => allAddrs.add(a));
      }
      if (accountEmail) allAddrs.delete(accountEmail);
      return Array.from(allAddrs).join(', ');
    }
    return lastMessage.direction === 'inbound' ? lastMessage.from_address : (lastMessage.to_addresses[0] || '');
  })();

  const handleAddFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files);
    const totalSize = [...attachments, ...newFiles].reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_ATTACHMENT_SIZE) {
      toast.error('Tamanho total dos anexos excede 25MB');
      return;
    }
    setAttachments(prev => [...prev, ...newFiles]);
  }, [attachments]);

  const handleSend = async () => {
    if (!body.trim() && attachments.length === 0) return;
    const target = resolvedTo || to;
    if (!target.trim()) {
      toast.error('Informe o destinatário');
      return;
    }

    try {
      // Convert attachments to base64
      const base64Attachments = await Promise.all(attachments.map(fileToBase64));

      if ((mode === 'reply' || mode === 'reply-all') && lastMessage) {
        const ccAddresses = mode === 'reply-all' && lastMessage
          ? [...(lastMessage.cc_addresses || [])].filter(a => a !== accountEmail)
          : undefined;

        await replyEmail.mutateAsync({
          thread_id: threadId,
          message_id: lastMessage.gmail_message_id,
          to: mode === 'reply-all' ? target.split(', ').filter(Boolean) : target,
          text_body: body,
          cc: ccAddresses?.length ? ccAddresses : undefined,
          attachments: base64Attachments.length > 0 ? base64Attachments : undefined,
        });
      } else if (mode === 'forward') {
        const fwdBody = lastMessage
          ? `${body}\n\n---------- Mensagem encaminhada ----------\nDe: ${lastMessage.from_name || lastMessage.from_address}\n\n${lastMessage.body_text || lastMessage.snippet}`
          : body;
        await sendEmail.mutateAsync({
          to: target,
          subject: lastMessage ? `Fwd: ${lastMessage.subject}` : '',
          text_body: fwdBody,
          attachments: base64Attachments.length > 0 ? base64Attachments : undefined,
        });
      } else {
        if (!newSubject?.trim()) { toast.error('Informe o assunto do e-mail'); return; }
        await sendEmail.mutateAsync({
          to: target,
          subject: newSubject.trim(),
          text_body: body,
          attachments: base64Attachments.length > 0 ? base64Attachments : undefined,
        });
      }

      setBody('');
      setTo('');
      setAttachments([]);
      onSent?.();
    } catch (err) { log.error('Unexpected error in EmailChatReplyBar:', err); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
    <div className="border-t bg-card/50 p-3 space-y-2">
      {/* Mode selector + forward destination */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 shrink-0">
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

        {mode === 'forward' && (
          <Input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="email@destinatario.com"
            className="h-7 text-xs flex-1"
          />
        )}

        {(mode === 'reply' || mode === 'reply-all') && resolvedTo && (
          <span className="text-[10px] text-muted-foreground truncate flex-1">
            para: {resolvedTo}
          </span>
        )}
      </div>

      {/* Input area */}
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'forward' ? 'Adicione uma mensagem...' : 'Digite sua resposta...'}
            className="min-h-[44px] max-h-[200px] text-sm resize-none pr-10"
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
          className="h-10 w-10 rounded-full shrink-0"
          onClick={handleSend}
          disabled={(!body.trim() && attachments.length === 0) || isSending || (!resolvedTo && !to.trim())}
          aria-label="Enviar"
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((f, i) => (
            <Badge key={i} variant="secondary" className="text-[10px] gap-1 py-0.5 max-w-[180px]">
              <Paperclip className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{f.name}</span>
              <span className="text-muted-foreground shrink-0">({formatFileSize(f.size)})</span>
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
            {formatFileSize(attachments.reduce((s, f) => s + f.size, 0))} / 25MB
          </span>
        </div>
      )}
    </div>
  );
}
