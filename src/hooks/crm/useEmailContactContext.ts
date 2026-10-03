import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/auth/useAuth';
import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
import { callCRMIntegration } from '@/lib/crmIntegration';
import type { EmailContactContext } from '@/types/emailContactContext';

export type EmailContactContextStatus = 'disabled' | 'loading' | 'not_linked' | 'error' | 'available';

interface ContextInput {
  accountId: string | undefined;
  threadId: string | undefined;
  contactId: string | null | undefined;
}

export function useEmailContactContext({ accountId, threadId, contactId }: ContextInput) {
  const { user } = useAuth();
  const crmEnabled = useCRMIntegrationEnabled();
  const enabled = Boolean(crmEnabled && user?.id && accountId && threadId && contactId);
  const query = useQuery<EmailContactContext | null>({
    queryKey: ['email-contact-context', user?.id ?? null, accountId ?? null, threadId ?? null, contactId ?? null],
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      if (!accountId || !threadId || !contactId) return null;
      const result = await callCRMIntegration<EmailContactContext>('emailContactContext', { accountId, threadId, contactId });
      return result.data;
    },
  });
  const status: EmailContactContextStatus = !crmEnabled || !user?.id || !accountId || !threadId || !contactId
    ? 'disabled'
    : query.isPending ? 'loading'
      : query.isError ? 'error'
        : query.data?.status === 'available' ? 'available' : 'not_linked';
  return { ...query, status };
}
