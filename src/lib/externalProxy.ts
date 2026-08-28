/**
 * Client helper for calling the external-db-proxy edge function
 */
import { supabase } from '@/integrations/supabase/client';

interface ProxySelectParams {
  table: string;
  select?: string;
  filters?: { column: string; operator: string; value: unknown }[];
  order?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  countMode?: 'exact' | 'planned' | 'estimated';
}

interface ProxyMutationParams {
  action: 'insert' | 'update';
  table: string;
  data?: Record<string, unknown> | Record<string, unknown>[];
  match?: Record<string, unknown>;
}

interface ProxyRPCParams {
  action: 'rpc';
  rpc: string;
  params?: Record<string, unknown>;
}

type ProxyParams = ProxySelectParams | ProxyMutationParams | ProxyRPCParams;

interface ProxyResponse<T = unknown> {
  data: T[];
  count?: number;
  error?: string;
}

export async function queryExternalProxy<T = unknown>(params: ProxyParams): Promise<ProxyResponse<T>> {
  const { data, error } = await supabase.functions.invoke('external-db-proxy', {
    body: params,
  });

  if (error) {
    // external-db-proxy is an optional VPS integration. Any invocation error
    // (403 Forbidden, 404 Not Found, relay error, network failure) means the
    // proxy is simply not configured for this deployment. Signal callers to
    // disable polling silently rather than throwing and spamming warnings.
    //
    // FunctionsHttpError.context is a Response whose .status is the HTTP code.
    // FunctionsHttpError.message is the status text (e.g. "Forbidden" for 403).
    // FunctionsFetchError occurs when the function isn't deployed at all.
    const msg = (error.message || '').toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (error as any).context;
    const status: number | undefined = ctx?.status;
    const isProxyUnavailable =
      status === 400 || status === 401 || status === 403 || status === 404 ||
      msg.includes('not found') ||
      msg.includes('non-2xx') ||
      msg.includes('forbidden') ||
      msg.includes('unauthorized') ||
      msg.includes('failed to fetch') ||
      // Supabase JS error classes for all function failures
      (error as any).name === 'FunctionsHttpError' ||
      (error as any).name === 'FunctionsFetchError' ||
      (error as any).name === 'FunctionsRelayError';

    if (isProxyUnavailable) {
      return { data: [], count: 0, notConfigured: true } as unknown as ProxyResponse<T>;
    }
    throw new Error(error.message || 'External DB proxy error');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as ProxyResponse<T>;
}
