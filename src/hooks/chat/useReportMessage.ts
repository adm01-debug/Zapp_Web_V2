import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/** A04 — reportar mensagem.
 *
 *  `message_reports` e a RPC `report_message` vêm do cartão pai t_3f7a2b9b e
 *  ainda NÃO estão em `src/integrations/supabase/types.ts` (integração pendente).
 *  Cast local deliberado — ver `useMessageFavorites.ts`.
 *
 *  Os motivos seguem o CONTRATO do cartão ('improprio'); o pai hoje traz
 *  'conteudo_improprio' no CHECK e será corrigido no [refazer]. */

type QueryError = { message: string; code?: string } | null;

interface UntypedQuery {
  select: (columns?: string) => UntypedQuery;
  eq: (column: string, value: unknown) => UntypedQuery;
  then: <T>(onfulfilled: (value: { data: unknown; error: QueryError }) => T) => Promise<T>;
}

interface UntypedClient {
  from: (table: string) => UntypedQuery;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: QueryError }>;
}

const db = supabase as unknown as UntypedClient;

export type ReportReason = 'spam' | 'improprio' | 'urgencia' | 'outro';

export const reportReasonsKey = (contactId: string) => ['message-reports', contactId] as const;

const EMPTY_REPORTED: ReadonlySet<string> = new Set();

/** Token local para a guarda de duplicidade — a RPC é idempotente e devolve o id
 *  existente sem erro, então sem esta guarda o usuário não teria feedback. */
const ALREADY_REPORTED = 'already_reported';

function reportErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === ALREADY_REPORTED) {
    return 'Você já reportou esta mensagem';
  }
  const err = error as QueryError;
  const token = `${err?.code ?? ''} ${err?.message ?? ''}`;
  if (token.includes('invalid_report_reason')) return 'Motivo de denúncia inválido';
  if (token.includes('invalid_report_note')) return 'A nota da denúncia deve ter até 500 caracteres';
  if (
    token.includes('message_not_visible') ||
    token.includes('not_authenticated') ||
    token.includes('42501')
  ) {
    return 'Você não tem permissão para esta ação nesta mensagem';
  }
  return 'Não foi possível concluir a ação';
}

export interface UseReportMessageResult {
  report: (messageId: string, reason: ReportReason, note?: string) => Promise<string>;
  isReported: (messageId: string) => boolean;
  reportedIds: ReadonlySet<string>;
  isLoading: boolean;
  isReporting: boolean;
  refetch: () => Promise<unknown>;
}

/** Reporta uma mensagem da conversa. Lê as denúncias anteriores do usuário
 *  (RLS limita às próprias) para impedir reportar a mesma mensagem duas vezes. */
export function useReportMessage(contactId: string | null | undefined): UseReportMessageResult {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: reportReasonsKey(contactId ?? ''),
    queryFn: async (): Promise<Set<string>> => {
      if (!contactId) return new Set<string>();
      const { data, error } = await db
        .from('message_reports')
        .select('message_id, messages!inner(contact_id)')
        .eq('messages.contact_id', contactId);
      if (error) throw error;
      const rows = (data as Array<{ message_id: string }> | null) ?? [];
      return new Set(rows.map((row) => row.message_id));
    },
    enabled: !!contactId,
    staleTime: 30_000,
  });

  const reportedIds = query.data ?? EMPTY_REPORTED;

  const mutation = useMutation({
    mutationFn: async (vars: { messageId: string; reason: ReportReason; note?: string }): Promise<string> => {
      if (reportedIds.has(vars.messageId)) throw new Error(ALREADY_REPORTED);
      const { data, error } = await db.rpc('report_message', {
        p_message_id: vars.messageId,
        p_reason: vars.reason,
        p_note: vars.note ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_data, vars) => {
      queryClient.setQueryData<Set<string>>(reportReasonsKey(contactId ?? ''), (current) => {
        const next = new Set(current ?? []);
        next.add(vars.messageId);
        return next;
      });
      toast.success('Mensagem reportada');
    },
    onError: (error) => {
      toast.error(reportErrorMessage(error));
    },
  });

  const report = useCallback(
    (messageId: string, reason: ReportReason, note?: string) =>
      mutation.mutateAsync({ messageId, reason, note }),
    [mutation],
  );
  const isReported = useCallback((messageId: string) => reportedIds.has(messageId), [reportedIds]);

  return {
    report,
    isReported,
    reportedIds,
    isLoading: query.isLoading,
    isReporting: mutation.isPending,
    refetch: query.refetch,
  };
}
