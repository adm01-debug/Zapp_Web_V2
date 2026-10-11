import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/** A05 — lembrar da mensagem ("Responder depois").
 *
 *  A RPC `remind_me_about_message` vem do cartão pai t_f025e4be e ainda NÃO está
 *  em `src/integrations/supabase/types.ts` (integração pendente). Cast local
 *  deliberado — ver `useMessageFavorites.ts`. */

type QueryError = { message: string; code?: string } | null;

interface UntypedClient {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: QueryError }>;
}

const db = supabase as unknown as UntypedClient;

function remindErrorMessage(error: QueryError): string {
  const token = `${error?.code ?? ''} ${error?.message ?? ''}`;
  if (token.includes('remind_at_in_past')) return 'Escolha uma data futura para o lembrete';
  if (token.includes('remind_at_too_far')) return 'O lembrete pode ser no máximo 90 dias à frente';
  if (token.includes('profile_not_found')) return 'Perfil não encontrado para criar o lembrete';
  if (
    token.includes('message_not_visible') ||
    token.includes('not_authenticated') ||
    token.includes('auth_required') ||
    token.includes('42501')
  ) {
    return 'Você não tem permissão para esta ação nesta mensagem';
  }
  return 'Não foi possível concluir a ação';
}

export interface UseRemindMessageResult {
  remind: (messageId: string, remindAt: string | Date, note?: string) => Promise<string>;
  isSaving: boolean;
}

/** Cria o lembrete de uma mensagem para a data/hora escolhida. A validação de
 *  janela (futuro, até 90 dias) é do banco; aqui só traduzimos o retorno. */
export function useRemindMessage(): UseRemindMessageResult {
  const mutation = useMutation({
    mutationFn: async (vars: { messageId: string; remindAt: string; note?: string }): Promise<string> => {
      const { data, error } = await db.rpc('remind_me_about_message', {
        p_message_id: vars.messageId,
        p_remind_at: vars.remindAt,
        p_note: vars.note ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success('Lembrete criado');
    },
    onError: (error) => {
      toast.error(remindErrorMessage(error as QueryError));
    },
  });

  const remind = useCallback(
    (messageId: string, remindAt: string | Date, note?: string) =>
      mutation.mutateAsync({
        messageId,
        remindAt: remindAt instanceof Date ? remindAt.toISOString() : remindAt,
        note,
      }),
    [mutation],
  );

  return { remind, isSaving: mutation.isPending };
}
