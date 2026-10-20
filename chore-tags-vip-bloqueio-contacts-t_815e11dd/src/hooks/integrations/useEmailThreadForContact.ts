import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type EmailThreadForContactStatus = 'loading' | 'found' | 'none' | 'error';

export interface EmailThreadForContactResult {
  status: EmailThreadForContactStatus;
  threadId: string | null;
}

/**
 * C03 — conversa de e-mail mais recente de um contato na conta Gmail ativa
 * (email_threads por contact_id, last_message_at desc, teto 1). O RLS da tabela
 * já restringe ao usuário — não usa service role.
 */
export function useEmailThreadForContact(
  gmailAccountId: string | null | undefined,
  contactId: string | null | undefined,
): EmailThreadForContactResult {
  const query = useQuery({
    queryKey: ['email-thread-for-contact', gmailAccountId ?? null, contactId ?? null],
    enabled: Boolean(gmailAccountId && contactId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_threads')
        .select('id')
        .eq('gmail_account_id', gmailAccountId!)
        .eq('contact_id', contactId!)
        .order('last_message_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0]?.id as string | undefined) ?? null;
    },
  });

  const status: EmailThreadForContactStatus = !gmailAccountId || !contactId
    ? 'none'
    : query.isPending ? 'loading'
    : query.isError ? 'error'
    : query.data ? 'found' : 'none';

  return { status, threadId: query.data ?? null };
}
