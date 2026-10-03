import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/auth/useAuth';
import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
import { callCRMIntegration } from '@/lib/crmIntegration';
import { isEmailContactContext, type EmailContactContext } from '@/types/emailContactContext';

export type EmailContactContextStatus = 'disabled' | 'loading' | 'not_linked' | 'ambiguous' | 'permission_denied' | 'error' | 'available';

interface ContextInput {
  accountId: string | undefined;
  threadId: string | undefined;
  contactId: string | null | undefined;
}

export function useEmailContactContext({ accountId, threadId, contactId }: ContextInput) {
  const { user } = useAuth();
  const crmEnabled = useCRMIntegrationEnabled();
  const enabled = Boolean(crmEnabled && user?.id && accountId && threadId);
  const query = useQuery<EmailContactContext | null>({
    queryKey: ['email-contact-context', user?.id ?? null, accountId ?? null, threadId ?? null, contactId ?? null],
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      if (!accountId || !threadId) return null;
      const result = await callCRMIntegration<EmailContactContext>('emailContactContext', {
        accountId, threadId, ...(contactId ? { contactId } : {}),
      });
      if (!isEmailContactContext(result.data)) throw new Error('CRM returned an invalid email company context');
      return result.data;
    },
  });
  const status: EmailContactContextStatus = !crmEnabled || !user?.id || !accountId || !threadId
    ? 'disabled'
      : query.isPending ? 'loading'
      : query.isError && query.error instanceof Error && /not visible/i.test(query.error.message) ? 'permission_denied'
      : query.isError ? 'error'
        : query.data?.status === 'available' ? 'available'
          : query.data?.status === 'ambiguous' ? 'ambiguous' : 'not_linked';
  return { ...query, status };
}
