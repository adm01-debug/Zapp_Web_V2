// TalkXRecipientRowActions.tsx — ações por linha de destinatário (reenviar, bloquear, abrir conversa)
import React, { useState, useCallback } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseHelpers';
import type { TalkXRecipient } from '@/hooks/integrations/useTalkX';

interface TalkXRecipientRowActionsProps {
  recipient: TalkXRecipient;
  onActionDone?: () => void;
}

/**
 * Retorna true quando o destinatário pode ser reenviado manualmente:
 * status 'failed' ou 'skipped' e menos de 3 retries manuais.
 */
function canRetry(recipient: TalkXRecipient): boolean {
  return (recipient.status === 'failed' || recipient.status === 'skipped')
    && ((recipient as { manual_retry_count?: number }).manual_retry_count ?? 0) < 3;
}

export function TalkXRecipientRowActions({ recipient, onActionDone }: TalkXRecipientRowActionsProps) {
  const [blocking, setBlocking] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const handleOpenChat = useCallback(() => {
    const contactId = recipient.contact_id;
    if (!contactId) return;
    const appWindow = window as Window & { __pendingOpenContactId?: string };
    appWindow.__pendingOpenContactId = contactId;
    window.dispatchEvent(new CustomEvent('open-contact-chat', { detail: { contactId } }));
  }, [recipient.contact_id]);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try {
      const { error } = await supabase.rpc('retry_talkx_recipients', {
        p_campaign_id: recipient.campaign_id,
        p_recipient_ids: [recipient.id],
      });
      if (error) throw error;
      toast.success('Destinatário reenviado.');
      onActionDone?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg.includes('stale_revision') ? 'Revisão desatualizada — recarregue e tente novamente.' : msg);
    } finally {
      setRetrying(false);
    }
  }, [recipient.campaign_id, recipient.id, onActionDone]);

  const handleBlock = useCallback(async () => {
    setBlocking(true);
    try {
      const { error } = await supabase.rpc('talkx_suppress_contact', {
        p_campaign_id: recipient.campaign_id,
        p_contact_id: recipient.contact_id,
        p_origin: 'manual_block',
        p_phone: recipient.contacts?.phone ?? '',
        p_reason: 'Bloqueado manualmente pelo operador',
        p_reason_code: 'manual',
        p_source_message_id: '',
      });
      if (error) throw error;
      toast.success('Contato bloqueado com sucesso.');
      onActionDone?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg.includes('stale_revision') ? 'Revisão desatualizada — recarregue e tente novamente.' : msg);
    } finally {
      setBlocking(false);
    }
  }, [recipient.campaign_id, recipient.contact_id, recipient.contacts, onActionDone]);

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
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="text-2xs text-dash-amber hover:underline font-medium disabled:opacity-50"
          title="Reenviar mensagem"
        >
          {retrying ? 'Reenviando…' : 'Reenviar'}
        </button>
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
  recipient: TalkXRecipient;
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
        {blocking ? 'Bloquendo…' : 'Bloquear'}
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
              {blocking ? 'Bloqueado…' : 'Bloquear'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}