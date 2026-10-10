// TalkXRecipientRowActions.tsx — ações por linha de destinatário (reenviar, bloquear, abrir conversa)
import React, { useState, useCallback } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseHelpers';

interface TalkXRecipientRowActionsProps {
  recipient: {
    id: string;
    campaign_id: string;
    contact_id: string;
    status: string;
    contacts?: { name?: string | null; phone?: string | null } | null;
    manual_retry_count: number | null;
  };
  onActionDone?: () => void;
}

/**
 * A query de destinatários não traz coluna `can_retry` da RPC: esta regra
 * espelha a validação de `retry_talkx_recipients` (status terminal 'failed' ou
 * 'skipped' e menos de 3 retries manuais).
 */
function canRetry(recipient: { status: string; manual_retry_count: number | null }): boolean {
  return (recipient.status === 'failed' || recipient.status === 'skipped')
    && (recipient.manual_retry_count ?? 0) < 3;
}

function rpcMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/**
 * Recusas conhecidas de `retry_talkx_recipients` → mensagem em português.
 * Retorna null quando não é recusa mapeada (erro real).
 */
function retryRefusalMessage(msg: string): string | null {
  if (msg.includes('talkx_retry_recipient_suppressed')) return 'Contato bloqueado — reenvio não permitido.';
  if (msg.includes('talkx_retry_limit_reached')) return 'Limite de 3 reenvios manuais atingido.';
  if (msg.includes('talkx_retry_recipient_not_terminal')) return 'Só destinatários com falha ou pulados podem ser reenviados.';
  if (msg.includes('talkx_retry_recipient_ineligible')) return 'Contato inelegível para reenvio.';
  if (msg.includes('talkx_retry_recipient_not_found')) return 'Destinatário não encontrado nesta campanha.';
  if (msg.includes('talkx_campaign_not_retryable')) return 'Campanha não permite reenvio neste estado.';
  return null;
}

/**
 * Recusa vinda no corpo jsonb de sucesso (ok:false) → mensagem em português.
 * Retorna null quando o corpo indica sucesso.
 */
function retryDataRefusal(data: unknown): string | null {
  if (typeof data === 'object' && data !== null) {
    const d = data as Record<string, unknown>;
    if (d.ok === false || d.success === false) {
      const reason = typeof d.reason === 'string' ? d.reason : typeof d.error === 'string' ? d.error : '';
      return retryRefusalMessage(reason) ?? 'Reenvio recusado pelo servidor.';
    }
  }
  return null;
}

export function TalkXRecipientRowActions({ recipient, onActionDone }: TalkXRecipientRowActionsProps) {
  const [blocking, setBlocking] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryOpen, setRetryOpen] = useState(false);

  const contactLabel = recipient.contacts?.name
    ?? recipient.contacts?.phone
    ?? 'este contato';

  const handleOpenChat = useCallback(() => {
    const contactId = recipient.contact_id;
    if (!contactId) return;
    const appWindow = window as Window & { __pendingOpenContactId?: string };
    appWindow.__pendingOpenContactId = contactId;
    window.dispatchEvent(new CustomEvent('open-contact-chat', { detail: { contactId } }));
  }, [recipient.contact_id]);

  const doRetry = useCallback(async () => {
    setRetrying(true);
    try {
      const { data, error } = await supabase.rpc('retry_talkx_recipients', {
        p_campaign_id: recipient.campaign_id,
        p_recipient_ids: [recipient.id],
      });
      if (error) throw error;
      const refusal = retryDataRefusal(data);
      if (refusal) {
        toast.warning(refusal);
        return;
      }
      toast.success('Destinatário reenviado.');
      onActionDone?.();
    } catch (err: unknown) {
      const msg = rpcMessage(err);
      const refusal = retryRefusalMessage(msg);
      if (refusal) {
        toast.warning(refusal);
      } else {
        toast.error(msg.includes('stale_revision') ? 'Revisão desatualizada — recarregue e tente novamente.' : msg);
      }
    } finally {
      setRetrying(false);
    }
  }, [recipient.campaign_id, recipient.id, onActionDone]);

  const handleRetryConfirm = useCallback(async () => {
    setRetryOpen(false);
    await doRetry();
  }, [doRetry]);

  const handleBlock = useCallback(async () => {
    setBlocking(true);
    try {
      const { data, error } = await supabase.rpc('talkx_suppress_contact', {
        p_campaign_id: recipient.campaign_id,
        p_contact_id: recipient.contact_id,
        p_origin: 'manual_block',
        // Sem fallback '': telefone ausente vai como null (a RPC aceita).
        p_phone: recipient.contacts?.phone ?? (null as unknown as string),
        p_reason: 'Bloqueado manualmente pelo operador',
        // 'manual' é valor válido do enum talkx_blacklist_reason
        // (opt_out, invalid_number, manual, lgpd, no_commercial_permission, bounce).
        p_reason_code: 'manual',
        // uuid nunca recebe '': sem mensagem de origem, passa null.
        p_source_message_id: null as unknown as string,
      });
      if (error) throw error;
      // A RPC retorna o id da supressão, ou null quando já estava suprimido.
      if (data === null) {
        toast.warning('Contato já estava bloqueado.');
      } else {
        toast.success('Contato bloqueado com sucesso.');
      }
    } catch (err: unknown) {
      toast.error(rpcMessage(err));
    } finally {
      setBlocking(false);
    }
  }, [recipient.campaign_id, recipient.contact_id, recipient.contacts]);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={handleOpenChat}
        className="text-2xs text-primary hover:underline font-medium"
        title="Abrir conversa"
      >
        Abrir conversa
      </button>
      {canRetry(recipient) && (
        <>
          <button
            type="button"
            onClick={() => setRetryOpen(true)}
            disabled={retrying}
            className="text-2xs text-dash-amber hover:underline font-medium disabled:opacity-50"
            title="Reenviar mensagem"
          >
            {retrying ? 'Reenviando…' : 'Reenviar'}
          </button>
          <AlertDialog open={retryOpen} onOpenChange={setRetryOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reenviar para {contactLabel}?</AlertDialogTitle>
                <AlertDialogDescription>
                  O destinatário voltará para a fila de envio desta campanha.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleRetryConfirm} disabled={retrying}>
                  {retrying ? 'Reenviando…' : 'Reenviar'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
      <BlockButton
        recipient={recipient}
        blocking={blocking}
        setBlocking={setBlocking}
        onBlocked={handleBlock}
        onActionDone={onActionDone}
      />
    </div>
  );
}

function BlockButton({
  recipient,
  blocking,
  setBlocking,
  onBlocked,
  onActionDone,
}: {
  recipient: { id: string; campaign_id: string; contact_id: string; status: string; contacts?: { name?: string | null; phone?: string | null } | null; manual_retry_count: number | null };
  blocking: boolean;
  setBlocking: (v: boolean) => void;
  onBlocked: () => Promise<void>;
  onActionDone?: () => void;
}) {
  const [open, setOpen] = useState(false);

  const handleConfirm = useCallback(async () => {
    setOpen(false);
    await onBlocked();
    onActionDone?.();
  }, [onBlocked, onActionDone]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={blocking}
        className="text-2xs text-dash-red hover:underline font-medium disabled:opacity-50"
        title="Bloquear contato"
      >
        {blocking ? 'Bloqueando…' : 'Bloquear'}
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bloquear contato?</AlertDialogTitle>
            <AlertDialogDescription>
              {recipient.contacts?.name
                ? `Bloquear "${recipient.contacts.name}" (${recipient.contacts.phone ?? 'sem telefone'})? O contato não receberá mais mensagens desta campanha.`
                : 'Bloquear este contato? Ele não receberá mais mensagens desta campanha.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={blocking}
              className="bg-dash-red text-dash-red-foreground hover:bg-dash-red/90"
            >
              {blocking ? 'Bloqueando…' : 'Bloquear'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
