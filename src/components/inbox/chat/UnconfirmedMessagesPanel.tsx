/**
 * Painel de mensagens com entrega ambígua (C110).
 *
 * Aparece quando há mensagens cujo POST para o provedor foi iniciado mas o recibo nunca chegou
 * e o job de reconciliação não conseguiu confirmar. Só admins e supervisores enxergam os botões
 * de correção manual — o RPC resolve_unconfirmed_message valida a permissão no banco.
 *
 * Design: segue o mesmo padrão de SendErrorBanner — mola curta, AnimatePresence, zappMotion.
 * Botões "Entregue" e "Não Entregue" por mensagem; spinner individual enquanto a mutation roda.
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, Check, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useUnconfirmedMessages } from '@/hooks/delivery/useUnconfirmedMessages';

export interface UnconfirmedMessagesPanelProps {
  contactId: string | null | undefined;
  className?: string;
}

function formatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return '';
  }
}

function truncate(text: string | null | undefined, max = 60): string {
  if (!text) return '(sem texto)';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function UnconfirmedMessagesPanel({ contactId, className }: UnconfirmedMessagesPanelProps) {
  const reduzido = useReducedMotion();
  const { messages, isLoading, isError, resolve, isResolving, resolvingId } = useUnconfirmedMessages(contactId);

  const visible = messages.length > 0;

  const slideIn = reduzido
    ? {}
    : { initial: { opacity: 0, y: -8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } };

  if (isLoading || isError || !visible) return null;

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="unconfirmed-panel"
          {...slideIn}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className={cn(
            'mx-3 mb-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm',
            className,
          )}
          role="region"
          aria-label="Mensagens com entrega não confirmada"
        >
          <div className="mb-1.5 flex items-center gap-1.5 text-warning-foreground font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {messages.length === 1
                ? '1 mensagem com entrega não confirmada'
                : `${messages.length} mensagens com entrega não confirmada`}
            </span>
          </div>

          <ul className="space-y-2">
            {messages.map((msg) => {
              const pending = isResolving && resolvingId === msg.id;
              return (
                <li
                  key={msg.id}
                  className="flex items-start justify-between gap-2 rounded-md bg-background/60 px-2 py-1.5"
                >
                  <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                    <span className="mr-1 text-foreground/80">{formatTimestamp(msg.created_at)}</span>
                    {truncate(msg.content)}
                  </span>

                  <div className="flex shrink-0 items-center gap-1">
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          disabled={isResolving}
                          onClick={() => resolve({ messageId: msg.id, outcome: 'sent' })}
                          aria-label={`Marcar mensagem de ${formatTimestamp(msg.created_at)} como entregue`}
                        >
                          <Check className="mr-1 h-3 w-3" aria-hidden="true" />
                          Entregue
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                          disabled={isResolving}
                          onClick={() => resolve({ messageId: msg.id, outcome: 'not_delivered' })}
                          aria-label={`Marcar mensagem de ${formatTimestamp(msg.created_at)} como não entregue`}
                        >
                          <X className="mr-1 h-3 w-3" aria-hidden="true" />
                          Não entregue
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
