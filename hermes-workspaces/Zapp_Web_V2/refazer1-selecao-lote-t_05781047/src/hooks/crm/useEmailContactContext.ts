import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/auth/useAuth';
import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
import { callCRMIntegration } from '@/lib/crmIntegration';
import { isEmailContactContext, type EmailContactContext } from '@/types/emailContactContext';

export type EmailContactContextStatus = 'disabled' | 'loading' | 'not_linked' | 'ambiguous' | 'permission_denied' | 'error' | 'available';

interface ContextInput {
  accountId: string | undefined;
  threadId: string | undefined;
  contactId: string | null | undefined;
  selectedExternalContactId?: string | null;
}

export function useEmailContactContext({ accountId, threadId, contactId, selectedExternalContactId = null }: ContextInput) {
  const { user } = useAuth();
  const crmEnabled = useCRMIntegrationEnabled();
  const queryClient = useQueryClient();
  const enabled = Boolean(crmEnabled && user?.id && accountId && threadId);
  const query = useQuery<EmailContactContext | null>({
    queryKey: ['email-contact-context', user?.id ?? null, accountId ?? null, threadId ?? null, contactId ?? null, selectedExternalContactId],
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      if (!accountId || !threadId) return null;
      const result = await callCRMIntegration<EmailContactContext>('emailContactContext', {
        accountId, threadId, ...(contactId ? { contactId } : {}),
        ...(selectedExternalContactId ? { selectedExternalContactId } : {}),
      });
      if (!isEmailContactContext(result.data)) throw new Error('CRM returned an invalid email company context');
      return result.data;
    },
  });
  const status: EmailContactContextStatus = !crmEnabled || !user?.id || !accountId || !threadId
    ? 'disabled'
      : query.isPending ? 'loading'
      : query.isError && query.error instanceof Error && /integration is disabled/i.test(query.error.message) ? 'disabled'
      : query.isError && query.error instanceof Error && /not visible/i.test(query.error.message) ? 'permission_denied'
      : query.isError ? 'error'
        : query.data?.status === 'available' ? 'available'
        : query.data?.status === 'ambiguous' ? 'ambiguous' : 'not_linked';
  const linkCompany = useMutation({
    mutationFn: async (externalContactId: string) => {
      if (!accountId || !threadId) throw new Error('A conversa não está disponível para vínculo');
      return callCRMIntegration<{ linked: boolean }>('linkEmailContactCompany', { accountId, threadId, externalContactId });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['email-contact-context', user?.id ?? null, accountId ?? null, threadId ?? null] });
    },
  });
  return { ...query, status, linkCompany };
}
