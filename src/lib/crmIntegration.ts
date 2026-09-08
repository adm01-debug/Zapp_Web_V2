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

  if (error) {
    const context = 'context' in error ? error.context : undefined;
    if (context instanceof Response) {
      let domainError: string | null = null;
      try {
        const details = await context.clone().json() as { error?: unknown };
        if (typeof details.error === 'string' && details.error.length <= 300) domainError = details.error;
      } catch { /* Preserve the SDK error when the response is not JSON. */ }
      if (domainError) throw new Error(domainError);
    }
    throw new Error(error.message || 'CRM integration request failed');
  }
  if (!data || typeof data !== 'object') throw new Error('CRM integration returned an invalid response');
  if (typeof data.error === 'string') throw new Error(data.error);
  if (!Object.prototype.hasOwnProperty.call(data, 'data')) throw new Error('CRM integration response has no data');

  return data as CRMIntegrationResponse<T>;
}
