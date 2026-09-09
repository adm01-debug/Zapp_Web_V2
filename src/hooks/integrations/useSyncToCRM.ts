/**
 * useSyncToCRM
 * 
 * Syncs completed conversations from zapp-web back to the external CRM.
 * Calls sync_interaction_from_zapp RPC which:
 * - Finds the contact by phone
 * - Creates an interaction record
 * - Recalculates relationship_score
 * - Deduplicates by zapp_conversation_id
 * 
 * Usage: call syncConversation() when a conversation is resolved/closed.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
import { callCRMIntegration } from '@/lib/crmIntegration';
import { log } from '@/lib/logger';

interface SyncParams {
  /** Canonical Zapp contact UUID. Phone is resolved server-side. */
  contactId: string;
  channel?: string;
  direction?: string;
  assunto?: string;
  resumo?: string;
  sentiment?: string;
  messageCount?: number;
  durationSeconds?: number;
  agentName?: string;
}

interface SyncResult {
  synced: boolean;
  queued?: boolean;
  reason?: string;
  interaction_id?: string;
  contact_id?: string;
  company_id?: string;
  new_relationship_score?: number;
}

export function useSyncToCRM() {
  const queryClient = useQueryClient();
  const crmEnabled = useCRMIntegrationEnabled();

  const mutation = useMutation<SyncResult | null, Error, SyncParams>({
    mutationFn: async (params) => {
      if (!crmEnabled) return null;

      // Metadata is derived from canonical closure/contact rows by the backend.
      // The browser sends identity only so it cannot forge CRM interaction data.
      const response = await callCRMIntegration<SyncResult>('enqueueSync', { contactId: params.contactId });
      return response.data;
    },
    onSuccess: (result, params) => {
      if (result?.synced || result?.queued) {
        // Invalidate the 360° cache for this phone so it refreshes
        queryClient.invalidateQueries({ queryKey: ['external-contact-360'] });
        queryClient.invalidateQueries({ queryKey: ['external-contact-360-batch'] });
        log.info('CRM sync success:', result);
      }
    },
  });

  return {
    syncConversation: mutation.mutate,
    syncConversationAsync: mutation.mutateAsync,
    isSyncing: mutation.isPending,
    lastResult: mutation.data,
    isConfigured: crmEnabled,
  };
}
