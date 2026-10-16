import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * PM-48 (t_8b39959f) — a limpeza dos e-mails guardados de uma conta Gmail
 * DESCONECTADA, por acao explicita do ADMIN.
 *
 * O componente do cartao nao fala com o Supabase direto (eslint.config.js:
 * `src/components/**` nao importa o client — o acesso a dados vive em
 * hooks/services), entao o RPC `purge_gmail_account_data` e a contagem de apoio
 * ficam aqui.
 *
 * Quem pode: SO admin. A barreira de verdade esta dentro do RPC
 * (`is_admin(auth.uid())` -> 42501); a tela esconder o botao e a segunda camada.
 * O RPC tambem exige a conta DESCONECTADA e `p_confirm` igual ao email da conta
 * (22023 fora disso) — a tela repete as duas checagens antes de chamar.
 */

/** Falha do RPC (PostgrestError): 42501 admin_required / 22023 purge_not_allowed. */
export interface GmailPurgeError {
  code?: string;
  message?: string;
}

/** O que existe guardado hoje para a conta (o que a limpeza vai apagar). */
export interface GmailStoredDataCounts {
  threads: number;
  messages: number;
  attachments: number;
}

/** Mesmo objeto que o RPC devolve e grava em `audit_logs.details`. */
export interface GmailPurgeResult {
  account_id: string;
  email_masked: string;
  deleted: {
    email_attachments: number;
    email_messages: number;
    email_threads: number;
    email_drafts: number;
  };
  total_rows: number;
}

/**
 * Contagens mostradas no dialogo ANTES de confirmar. A RLS de leitura das tres
 * tabelas libera admin (20260827210200_email_attachments + policy de
 * email_threads), entao o admin enxerga o que vai perder mesmo quando a conta
 * nao e dele.
 */
export function useGmailStoredDataCounts(accountId?: string) {
  return useQuery({
    queryKey: ['gmail-stored-data-counts', accountId],
    enabled: Boolean(accountId),
    queryFn: async (): Promise<GmailStoredDataCounts> => {
      const id = accountId as string;
      const [threads, messages, attachments] = await Promise.all([
        supabase.from('email_threads').select('id', { count: 'exact', head: true }).eq('gmail_account_id', id),
        supabase.from('email_messages').select('id', { count: 'exact', head: true }).eq('gmail_account_id', id),
        supabase
          .from('email_attachments')
          .select('id, email_messages!inner(gmail_account_id)', { count: 'exact', head: true })
          .eq('email_messages.gmail_account_id', id),
      ]);

      const firstError = [threads.error, messages.error, attachments.error].find((e) => Boolean(e));
      if (firstError) throw firstError;

      return {
        threads: threads.count ?? 0,
        messages: messages.count ?? 0,
        attachments: attachments.count ?? 0,
      };
    },
  });
}

/** Executa a limpeza e devolve as contagens apagadas (confirmacao do resultado). */
export function usePurgeGmailAccountData() {
  const queryClient = useQueryClient();

  return useMutation<GmailPurgeResult, GmailPurgeError, { accountId: string; confirm: string }>({
    mutationFn: async ({ accountId, confirm }) => {
      const { data, error } = await supabase.rpc('purge_gmail_account_data', {
        p_account_id: accountId,
        p_confirm: confirm,
      });
      if (error) throw error;
      return data as unknown as GmailPurgeResult;
    },
    onSuccess: (_result, variables) => {
      // A conta sai da limpeza com o corpo vazio: recarrega contagens e listas.
      void queryClient.invalidateQueries({ queryKey: ['gmail-stored-data-counts', variables.accountId] });
      void queryClient.invalidateQueries({ queryKey: ['gmail-accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['gmail-threads'] });
      void queryClient.invalidateQueries({ queryKey: ['gmail-thread-counts'] });
    },
  });
}
