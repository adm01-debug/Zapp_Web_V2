import { supabase } from '@/integrations/supabase/client';

export type CRMIntegrationAction = 'rpc' | 'select' | 'mutate' | 'enqueueSync' | 'health';

export interface CRMIntegrationResponse<T> {
  data: T;
  meta?: {
    record_count: number | null;
    duration_ms: number;
    severity: 'ok' | 'slow';
  };
  queued?: boolean;
  outbox_id?: string;
}

export async function callCRMIntegration<T>(
  action: CRMIntegrationAction,
  payload: Record<string, unknown> = {},
): Promise<CRMIntegrationResponse<T>> {
  const { data, error } = await supabase.functions.invoke('crm-integration', {
    body: { ...payload, action },
  });

  if (error) throw new Error(error.message || 'CRM integration request failed');
  if (!data || typeof data !== 'object') throw new Error('CRM integration returned an invalid response');
  if (typeof data.error === 'string') throw new Error(data.error);

  return data as CRMIntegrationResponse<T>;
}
