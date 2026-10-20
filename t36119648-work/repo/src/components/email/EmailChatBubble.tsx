import { useState, useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { sanitizeEmailHtml, buildBodyPreview } from '@/lib/emailHtml';
import { EmailFullViewDialog } from './EmailFullViewDialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Download, Eye, Loader2, Paperclip, ChevronDown, Reply, ReplyAll, Forward, Star } from 'lucide-react';
import type { EmailAttachment, EmailMessage } from '@/hooks/integrations/useGmail';
import { formatEmailFileSize } from '@/lib/emailAttachments';
import { canPreviewEmailAttachment } from '@/lib/emailAttachmentPreview';

interface EmailChatBubbleProps {
  message: EmailMessage;
  isLast: boolean;
  showSubject?: boolean;
  onReply?: (message: EmailMessage) => void;
  onReplyAll?: (message: EmailMessage) => void;
  onForward?: (message: EmailMessage) => void;
  attachments?: EmailAttachment[];
  downloadingAttachmentId?: string;
  onDownloadAttachment?: (attachment: EmailAttachment) => void;
  onPreviewAttachment?: (attachment: EmailAttachment) => void;
}

function getInitials(name: string | null | undefined, email?: string): string {
  if (name) return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (email) return email[0]?.toUpperCase() || '?';
  return '?';
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export const EmailChatBubble = memo(function EmailChatBubble({ message, isLast, showSubject = false, onReply, onReplyAll, onForward, attachments = [], downloadingAttachmentId, onDownloadAttachment, onPreviewAttachment }: EmailChatBubbleProps) {
  const [expanded, setExpanded] = useState(isLast);
  const [fullView, setFullView] = useState(false);
  const isSent = message.direction === 'outbound';
  const hasMultipleRecipients = (message.to_addresses?.length || 0) + (message.cc_addresses?.length || 0) > 1;

  const bodyText = message.body_text || message.snippet || '';
  const bodyPreview = buildBodyPreview(bodyText);
  const hasMore = bodyText.length > 300 || Boolean(message.body_html && message.body_html.length > 300);
  // h538172: HTML sanitizado é a fonte visual da verdade quando existe;
  // body_text vira fallback (antes o HTML só era usado quando body_text não
  // existia — quase nunca — e a formatação se perdia no caso comum).
  const sanitizedHtml = useMemo(
    () => message.body_html ? sanitizeEmailHtml(message.body_html) : null,
    [message.body_html]
  );

  return (
    <TooltipProvider>
      <div
        className={cn('flex group gap-2 mb-3', isSent ? 'justify-end' : 'justify-start')}
        role="article"
        aria-label={`Mensagem de ${message.from_name || message.from_address}`}
      >
        {/* Avatar for inbound */}
        {!isSent && (
          <Avatar className="h-8 w-8 shrink-0 mt-1">
            <AvatarFallback className="text-3xs bg-accent text-accent-foreground">
              {getInitials(message.from_name, message.from_address)}
            </AvatarFallback>
          </Avatar>
        )}

        <div className="max-w-[75%] space-y-0.5 relative">
          {/* Hover actions */}
          <div className={cn(
            'absolute top-0 z-10 flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100',
            isSent ? 'right-full mr-1' : 'left-full ml-1'
          )}>
            {onReply && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onReply(message)}
                    className="p-1 rounded-full bg-card border border-border/50 text-muted-foreground hover:text-primary hover:bg-primary/10 shadow-sm transition-colors"
                    aria-label="Responder"
                  >
                    <Reply className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Responder</TooltipContent>
              </Tooltip>
            )}
            {onReplyAll && hasMultipleRecipients && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onReplyAll(message)}
                    className="p-1 rounded-full bg-card border border-border/50 text-muted-foreground hover:text-primary hover:bg-primary/10 shadow-sm transition-colors"
                    aria-label="Responder a todos"
                  >
                    <ReplyAll className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Responder a todos</TooltipContent>
              </Tooltip>
            )}
            {onForward && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onForward(message)}
                    className="p-1 rounded-full bg-card border border-border/50 text-muted-foreground hover:text-primary hover:bg-primary/10 shadow-sm transition-colors"
                    aria-label="Encaminhar"
                  >
                    <Forward className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Encaminhar</TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Sender name for inbound */}
          {!isSent && (
            <p className="text-3xs text-muted-foreground ml-1 truncate">
              {message.from_name || message.from_address}
              {hasMultipleRecipients && (
                <span className="opacity-60"> → {message.to_addresses?.length || 0} destinatários</span>
              )}
            </p>
          )}

          {/* Bubble */}
          <motion.div
            initial={{ opacity: 0, x: isSent ? 10 : -10, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className={cn(
              'rounded-2xl px-3.5 py-2.5 shadow-sm relative',
              isSent
                ? 'rounded-br-md border border-primary/20 bg-chat-sent text-chat-sent-foreground shadow-sm'
                : 'rounded-bl-md border border-border bg-chat-received text-chat-received-foreground shadow-sm'
            )}
          >
            {/* Subject line if present */}
            {showSubject && message.subject && (
              <p className={cn(
                'text-2xs font-semibold mb-1.5 pb-1.5 border-b',
                isSent ? 'border-primary-foreground/20' : 'border-border/30'
              )}>
                {message.subject}
              </p>
            )}

            {/* Body */}
            <div className="text-sm leading-relaxed break-words">
              {sanitizedHtml && expanded ? (
                <div className="email-html-scroll">
                  <div
                    className={cn('email-html-body text-sm relative', !fullView && 'email-html-collapsed')}
                    dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                  />
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{expanded ? bodyText : bodyPreview}</span>
              )}
              {hasMore && !expanded && '…'}
            </div>

            {hasMore && !fullView && (
              <button
                onClick={() => (sanitizedHtml ? setFullView(true) : setExpanded(!expanded))}
                className={cn(
                  'text-3xs mt-1 flex items-center gap-0.5 transition-colors',
                  isSent ? 'text-primary-foreground/70 hover:text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
                aria-label={expanded && !sanitizedHtml ? 'Ver menos' : 'Ver e-mail completo'}
              >
                <ChevronDown className={cn('w-3 h-3 transition-transform', expanded && !sanitizedHtml && 'rotate-180')} />
                {expanded && !sanitizedHtml ? 'Menos' : 'Ver e-mail completo'}
              </button>
            )}

            <EmailFullViewDialog
              open={fullView}
              onOpenChange={setFullView}
              sanitizedHtml={sanitizedHtml || ''}
              subject={message.subject}
              fromName={message.from_name}
              fromAddress={message.from_address}
            />

            {/* Attachments */}
            {message.has_attachments && (
              <div className={cn('mt-2 space-y-1 border-t pt-2 text-3xs', isSent ? 'border-primary-foreground/20' : 'border-border')}>
                {attachments.length === 0 ? <span className="flex items-center gap-1 opacity-70"><Paperclip className="h-3 w-3" />Metadados do anexo indisponíveis</span> : attachments.map(attachment => (
                  <div key={attachment.id} className="flex w-full items-center gap-2 rounded-lg bg-foreground/10 px-2 py-1.5">
                    <Paperclip className="h-3 w-3 shrink-0" /><span className="min-w-0 flex-1 truncate" title={attachment.filename || 'Anexo'}>{attachment.filename || 'Anexo'}</span><span className="opacity-60">{formatEmailFileSize(attachment.size_bytes || 0)}</span>
                    {canPreviewEmailAttachment(attachment.mime_type) && <button type="button" aria-label={`Visualizar ${attachment.filename || 'anexo'}`} className="rounded p-1 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onPreviewAttachment?.(attachment)}><Eye className="h-3 w-3" /></button>}
                    <button type="button" aria-label={`Baixar ${attachment.filename || 'anexo'}`} className="rounded p-1 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onDownloadAttachment?.(attachment)} disabled={downloadingAttachmentId === attachment.id}>{downloadingAttachmentId === attachment.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}</button>
                  </div>
                ))}
              </div>
            )}

            {/* Time + status */}
            <div className={cn(
              'flex items-center justify-end gap-1.5 mt-1',
              isSent ? 'text-primary-foreground/60' : 'text-muted-foreground'
            )}>
              {message.is_starred && <Star className="w-2.5 h-2.5 fill-current text-accent-foreground" />}
              <Tooltip>
                <TooltipTrigger>
                  <span className="text-3xs">{formatTime(message.internal_date)}</span>
                </TooltipTrigger>
                <TooltipContent>{formatFullDate(message.internal_date)}</TooltipContent>
              </Tooltip>
            </div>
          </motion.div>
        </div>

        {/* Avatar for outbound */}
        {isSent && (
          <Avatar className="h-8 w-8 shrink-0 mt-1">
            <AvatarFallback className="text-3xs bg-primary/10 text-primary">
              Eu
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </TooltipProvider>
  );
});
