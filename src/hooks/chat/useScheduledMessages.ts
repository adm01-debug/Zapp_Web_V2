import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from '@/hooks/ui/use-toast';
import { fetchAllRows, type PageResult } from '@/lib/fetchAllRows';

export type ScheduledMessageStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

export interface ScheduledMessage {
  id: string;
  contact_id: string;
  content: string;
  message_type: string;
  media_url: string | null;
  scheduled_at: string;
  status: ScheduledMessageStatus;
  sent_at: string | null;
  error_message: string | null;
  created_by: string | null;
  whatsapp_connection_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Faixa de tempo que a tela está exibindo (instantes ISO).
 *
 * A Agenda é um calendário: o que ela mostra é o pendente **do período visível**.
 * Sem faixa a consulta varre a tabela inteira e a primeira página do PostgREST
 * (teto de 1000 linhas) é ocupada por histórico — os agendamentos futuros somem
 * da tela (R2-MOD-029).
 */
export interface ScheduledMessagesWindow {
  /** Início da faixa (inclusive). Ausente = sem limite inferior. */
  from?: string | null;
  /** Fim da faixa (inclusive). Ausente = sem limite superior. */
  to?: string | null;
}

/**
 * Agendamentos do usuário. `messages` traz os **pendentes** — que é o que a
 * Agenda exibe e o que ela pode revisar/cancelar.
 *
 * `isError`/`error`/`refetch` existem para a tela distinguir **falha de leitura**
 * de **agenda vazia**: antes o erro ficava só no console e a tela anunciava
 * "0 pendentes" com a mesma cara de um dia sem agendamento.
 */
export function useScheduledMessages(
  contactId?: string,
  faixa: ScheduledMessagesWindow = {},
) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const from = faixa.from ?? null;
  const to = faixa.to ?? null;

  const {
    data: messages = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['scheduled-messages', contactId ?? 'all', from ?? null, to ?? null],
    queryFn: async (): Promise<ScheduledMessage[]> => {
      const base = () => {
        let query = supabase
          .from('scheduled_messages')
          .select('*')
          // A Agenda só mostra pendente: pedir isso ao servidor é o que impede o
          // histórico (enviado/cancelado) de ocupar o lugar dos futuros.
          .eq('status', 'pending')
          // Ordem determinística com desempate: a paginação por `range` precisa de
          // chave estável, senão páginas repetem ou pulam linhas.
          .order('scheduled_at', { ascending: true })
          .order('id', { ascending: true });

        if (contactId) query = query.eq('contact_id', contactId);
        if (from) query = query.gte('scheduled_at', from);
        if (to) query = query.lte('scheduled_at', to);
        return query;
      };

      // Percorre TODAS as páginas: um mês com mais de 1000 pendentes não pode
      // aparecer pela metade. O `select('*')` traz `status` como `string` (tipo
      // gerado do banco) e o hook expõe a união — cast de transporte, como no
      // resto do projeto.
      const { rows, incomplete, error: readError } = await fetchAllRows<ScheduledMessage>(
        (pageFrom, pageTo) =>
          base().range(pageFrom, pageTo) as unknown as PromiseLike<PageResult<ScheduledMessage>>,
      );
      // Erro de leitura não vira lista vazia: a tela tem de saber que falhou.
      if (readError) throw new Error(readError.message);
      if (incomplete) throw new Error('Leitura incompleta dos agendamentos');
      return rows;
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async (data: {
      contactId: string;
      content: string;
      scheduledAt: Date;
      messageType?: string;
      mediaUrl?: string;
      connectionId?: string;
    }) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user?.id ?? '')
        .maybeSingle();

      const { data: msg, error } = await supabase
        .from('scheduled_messages')
        .insert({
          contact_id: data.contactId,
          content: data.content,
          scheduled_at: data.scheduledAt.toISOString(),
          message_type: data.messageType || 'text',
          media_url: data.mediaUrl || null,
          created_by: profile?.id || null,
          whatsapp_connection_id: data.connectionId || null,
        })
        .select()
        .single();

      if (error) throw error;
      return msg;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages'] });
      toast({ title: 'Mensagem agendada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao agendar mensagem', description: error.message, variant: 'destructive' });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from('scheduled_messages')
        .update({ status: 'cancelled' })
        .eq('id', messageId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages'] });
      toast({ title: 'Agendamento cancelado' });
    },
  });

  return {
    messages,
    isLoading,
    isError,
    error,
    refetch,
    scheduleMessage: scheduleMutation.mutateAsync,
    cancelMessage: cancelMutation.mutateAsync,
    isScheduling: scheduleMutation.isPending,
  };
}