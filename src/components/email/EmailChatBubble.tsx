import { useState, memo, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Paperclip, ChevronDown, ChevronUp, Reply, ReplyAll, Forward, Star, Check, CheckCheck } from 'lucide-react';
import type { EmailMessage } from '@/hooks/integrations/useGmail';
import { sanitizeEmailHtml, extractTextFromHtml } from '@/lib/emailSanitize';

// ── E12: Heurística para e-mail rico (tabelas / imagens volumosas) ────────────
function isRichEmail(html: string): boolean {
  if (!html) return false;
  return /<table[\s>]/i.test(html) || (/<img[\s>]/i.test(html) && html.length > 600);
}

// ── E17: Cor determinística de avatar por endereço ───────────────────────────
const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
  'bg-orange-100 text-orange-700',
];

function getAvatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

interface EmailChatBubbleProps {
  message: EmailMessage;
  isLast: boolean;
  onReply?: (message: EmailMessage) => void;
  onReplyAll?: (message: EmailMessage) => void;
  onForward?: (message: EmailMessage) => void;
}

function getInitials(name: string | null, email: string): string {
  if (name) return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return email[0]?.toUpperCase() || '?';
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export const EmailChatBubble = memo(function EmailChatBubble({
  message, isLast, onReply, onReplyAll, onForward,
}: EmailChatBubbleProps) {
  const [expanded, setExpanded] = useState(isLast);
  const htmlBodyRef = useRef<HTMLDivElement>(null);
  const isSent = message.direction === 'outbound';
  const hasMultipleRecipients = (message.to_addresses?.length || 0) + (message.cc_addresses?.length || 0) > 1;
  const avatarColor = getAvatarColor(message.from_address);

  // E01 (G2): usar HTML quando não vazio — presença de body_text não descarta
  const useHtml = message.body_html !== '' && message.body_html != null;

  // E06+E07: sanitização memoizada por ID de mensagem
  const sanitizedHtml = useMemo(
    () => useHtml ? sanitizeEmailHtml(message.body_html, message.id) : null,
    [useHtml, message.body_html, message.id]
  );

  // E12: detectar e-mail rico para decidir o layout
  const isRich = useMemo(() => isRichEmail(message.body_html), [message.body_html]);

  // E08: preview e hasMore baseados no conteúdo efetivo
  const effectiveText = useMemo(() => {
    if (useHtml) return extractTextFromHtml(message.body_html);
    return message.body_text || message.snippet || '';
  }, [useHtml, message.body_html, message.body_text, message.snippet]);

  const hasMore = effectiveText.length > 800;
  const bodyPreview = effectiveText.slice(0, 800);

  // ── Layout: cartão largo para e-mail rico ────────────────────────────────
  if (isRich && sanitizedHtml) {
    return (
      <TooltipProvider>
        <div className="w-full max-w-[860px] mx-auto mb-4 group">
          {/* Cabeçalho do cartão */}
          <div className="flex items-center gap-3 px-4 py-2.5 border border-border/20 border-b-0 bg-muted/30 rounded-t-xl">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className={cn('text-[10px] font-medium', avatarColor)}>
                {getInitials(message.from_name, message.from_address)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{message.from_name || message.from_address}</p>
              {message.from_name && (
                <p className="text-[10px] text-muted-foreground truncate">{message.from_address}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Tooltip>
                <TooltipTrigger>
                  <span className="text-[10px] text-muted-foreground">{formatTime(message.internal_date)}</span>
                </TooltipTrigger>
                <TooltipContent>{formatFullDate(message.internal_date)}</TooltipContent>
              </Tooltip>
              {message.is_starred && <Star className="w-3 h-3 text-amber-500 fill-current" />}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                {onReply && (
                  <button onClick={() => onReply(message)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors" aria-label="Responder">
                    <Reply className="w-3.5 h-3.5" />
                  </button>
                )}
                {onForward && (
                  <button onClick={() => onForward(message)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors" aria-label="Encaminhar">
                    <Forward className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Corpo do cartão — E11: cor-scheme light, E02: .email-html-body */}
          {/* E27: overflow-x-auto em vez de overflow-hidden */}
          <div
            className={cn(
              'bg-white border border-border/20 border-t-0 overflow-x-auto',
              !expanded ? ['email-html-body-collapsed', 'rounded-b-xl'].join(' ') : 'rounded-b-xl'
            )}
          >
            {/* E03: sem whitespace-pre-wrap no caminho HTML */}
            <div
              ref={htmlBodyRef}
              className="email-html-body p-4"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          </div>

          {/* Controle expandir/colapsar */}
          {hasMore && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full text-[10px] py-1.5 text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 transition-colors mt-0.5"
              aria-label={expanded ? 'Ver menos' : 'Ver email completo'}
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? 'Menos' : 'Ver email completo'}
            </button>
          )}

          {/* Anexos */}
          {message.has_attachments && (
            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
              <Paperclip className="w-3 h-3" />
              <span>Possui anexos</span>
            </div>
          )}
        </div>
      </TooltipProvider>
    );
  }

  // ── Layout: bolha de chat para e-mail simples ────────────────────────────
  return (
    <TooltipProvider>
      <div
        className={cn('flex group gap-2 mb-3', isSent ? 'justify-end' : 'justify-start')}
        role="article"
        aria-label={`Mensagem de ${message.from_name || message.from_address}`}
      >
        {/* Avatar inbound */}
        {!isSent && (
          <Avatar className="h-8 w-8 shrink-0 mt-1">
            <AvatarFallback className={cn('text-[10px] font-medium', avatarColor)}>
              {getInitials(message.from_name, message.from_address)}
            </AvatarFallback>
          </Avatar>
        )}

        {/* E28: max-w-[70ch] em vez de max-w-[75%] */}
        <div className="max-w-[70ch] space-y-0.5 relative">
          {/* Hover actions */}
          <div className={cn(
            'absolute top-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10',
            isSent ? 'right-full mr-1' : 'left-full ml-1'
          )}>
            {onReply && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => onReply(message)} className="p-1 rounded-full bg-card border border-border/50 text-muted-foreground hover:text-primary hover:bg-primary/10 shadow-sm transition-colors" aria-label="Responder">
                    <Reply className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Responder</TooltipContent>
              </Tooltip>
            )}
            {onReplyAll && hasMultipleRecipients && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => onReplyAll(message)} className="p-1 rounded-full bg-card border border-border/50 text-muted-foreground hover:text-primary hover:bg-primary/10 shadow-sm transition-colors" aria-label="Responder a todos">
                    <ReplyAll className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Responder a todos</TooltipContent>
              </Tooltip>
            )}
            {onForward && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={() => onForward(message)} className="p-1 rounded-full bg-card border border-border/50 text-muted-foreground hover:text-primary hover:bg-primary/10 shadow-sm transition-colors" aria-label="Encaminhar">
                    <Forward className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Encaminhar</TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Nome remetente */}
          {!isSent && (
            <p className="text-[10px] text-muted-foreground ml-1 truncate">
              {message.from_name || message.from_address}
              {hasMultipleRecipients && (
                <span className="opacity-60"> → {message.to_addresses?.length || 0} destinatários</span>
              )}
            </p>
          )}

          {/* Bolha */}
          <motion.div
            initial={{ opacity: 0, x: isSent ? 10 : -10, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className={cn(
              'rounded-2xl px-3.5 py-2.5 shadow-sm relative',
              // E27: overflow-x-auto para não cortar conteúdo
              'overflow-x-auto',
              isSent
                ? 'rounded-br-md bg-primary text-primary-foreground'
                : 'rounded-bl-md bg-card border border-border/30 text-foreground'
            )}
          >
            {message.subject && (
              <p className={cn(
                'text-[11px] font-semibold mb-1.5 pb-1.5 border-b',
                isSent ? 'border-primary-foreground/20' : 'border-border/30'
              )}>
                {message.subject}
              </p>
            )}

            {/* E03: separar caminhos HTML e texto — whitespace-pre-wrap só em texto */}
            <div className={cn(
              'text-sm leading-relaxed break-words',
              !useHtml && 'whitespace-pre-wrap'
            )}>
              {useHtml && sanitizedHtml ? (
                expanded
                  ? <div className="email-html-body" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
                  : <span>{bodyPreview}{hasMore && '…'}</span>
              ) : (
                <span>
                  {expanded ? (message.body_text || message.snippet) : bodyPreview}
                  {hasMore && !expanded && '…'}
                </span>
              )}
            </div>

            {hasMore && (
              <button
                onClick={() => setExpanded(!expanded)}
                className={cn(
                  'text-[10px] mt-1 flex items-center gap-0.5 transition-colors',
                  isSent ? 'text-primary-foreground/70 hover:text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
                aria-label={expanded ? 'Ver menos' : 'Ver mais'}
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expanded ? 'Menos' : 'Mais'}
              </button>
            )}

            {message.has_attachments && (
              <div className={cn(
                'flex items-center gap-1 mt-1.5 pt-1.5 border-t text-[10px]',
                isSent ? 'border-primary-foreground/20 text-primary-foreground/70' : 'border-border/30 text-muted-foreground'
              )}>
                <Paperclip className="w-3 h-3" />
                <span>Anexo(s)</span>
              </div>
            )}

            {/* Hora + status */}
            <div className={cn(
              'flex items-center justify-end gap-1.5 mt-1',
              isSent ? 'text-primary-foreground/60' : 'text-muted-foreground'
            )}>
              {message.is_starred && <Star className="w-2.5 h-2.5 fill-current text-accent-foreground" />}
              <Tooltip>
                <TooltipTrigger>
                  <span className="text-[10px]">{formatTime(message.internal_date)}</span>
                </TooltipTrigger>
                <TooltipContent>{formatFullDate(message.internal_date)}</TooltipContent>
              </Tooltip>
              {isSent && (
                message.is_read
                  ? <CheckCheck className="w-3 h-3" />
                  : <Check className="w-3 h-3" />
              )}
            </div>
          </motion.div>
        </div>

        {/* Avatar outbound */}
        {isSent && (
          <Avatar className="h-8 w-8 shrink-0 mt-1">
            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">Eu</AvatarFallback>
          </Avatar>
        )}
      </div>
    </TooltipProvider>
  );
});
