/**
 * Fase 2 — ponte entre a mensagem do cliente e a agenda.
 *
 * O cliente escreve "me liga na quinta"; `detectReminderIntent` (puro) diz que
 * existe uma data e qual é. Este hook transforma isso na OFERTA que a UI mostra
 * ("Criar lembrete para quinta, 27/11?") e, quando o usuário aceita, grava o
 * lembrete com um clique — sem digitar nada.
 *
 * A detecção é determinística de propósito: não depende de o modelo responder
 * bem, então funciona mesmo com a IA degradada (exigência da Fase 2 do plano).
 */
import { useCallback, useMemo, useState } from 'react';
import { detectReminderIntent, type ReminderIntent } from '@/lib/assistant/detectReminderIntent';
import { useContactAgenda } from './useContactAgenda';

export interface ReminderOffer extends ReminderIntent {
  /** Texto sugerido do lembrete (editável na UI). */
  title: string;
  /** Chave idempotente: derivada uma vez por oferta, reusada no duplo clique. */
  clientTaskId: string;
}

/** Sugestão curta e acionável, sem repetir a mensagem inteira do cliente. */
function suggestTitle(detected: ReminderIntent, contactName: string): string {
  const alvo = contactName?.trim() || 'cliente';
  return `Falar com ${alvo} (${detected.label})`;
}

/**
 * @param lastContactMessage última mensagem RECEBIDA do cliente
 * @param dismissedAt mensagem já dispensada pelo usuário (não reoferece a mesma)
 */
export function useReminderOffer(contactId: string | null | undefined, contactName: string, lastContactMessage: string | null | undefined) {
  const agenda = useContactAgenda(contactId);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const detected = useMemo(
    () => (lastContactMessage ? detectReminderIntent(lastContactMessage) : null),
    [lastContactMessage]
  );

  const offer = useMemo<ReminderOffer | null>(() => {
    if (!detected || !contactId) return null;
    if (dismissedFor === lastContactMessage) return null;
    return {
      ...detected,
      title: suggestTitle(detected, contactName),
      clientTaskId: crypto.randomUUID(),
    };
  }, [detected, contactId, contactName, dismissedFor, lastContactMessage]);

  const dismiss = useCallback(() => {
    setDismissedFor(lastContactMessage ?? null);
    setSaveError(null);
  }, [lastContactMessage]);

  const accept = useCallback(
    async (override?: { title?: string; remindAt?: string }): Promise<string | null> => {
      if (!offer || !contactId) return null;
      setIsSaving(true);
      setSaveError(null);
      try {
        const id = await agenda.createReminder({
          contactId,
          title: override?.title?.trim() || offer.title,
          remindAt: override?.remindAt || offer.remindAt,
          description: `Pedido do cliente: "${offer.matchedText}"`,
          clientTaskId: offer.clientTaskId,
        });
        // Aceite some da tela mesmo quando o insert devolve null (idempotente).
        setDismissedFor(lastContactMessage ?? null);
        return id;
      } catch (err) {
        const blocked = (err as { blocked?: string }).blocked;
        setSaveError(blocked === 'remind_in_past' ? 'O horário do lembrete já passou.' : 'Não foi possível criar o lembrete.');
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [agenda, contactId, lastContactMessage, offer]
  );

  return {
    offer,
    agendaItems: agenda.items,
    agendaLoading: agenda.isLoading,
    agendaError: agenda.isError,
    isSaving,
    saveError,
    accept,
    dismiss,
  };
}