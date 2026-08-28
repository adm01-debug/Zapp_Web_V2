import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { log } from '@/lib/logger';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export function useEvolutionApiCore() {
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);
  const inflightRef = useRef<Map<string, Promise<any>>>(new Map());

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callApi = useCallback(async (action: string, body?: object, method: HttpMethod = 'POST'): Promise<any> => {
    const dedupeKey = method === 'GET' ? `${action}:${JSON.stringify(body || {})}` : '';
    if (dedupeKey && inflightRef.current.has(dedupeKey)) {
      return inflightRef.current.get(dedupeKey);
    }

    if (mountedRef.current) setIsLoading(true);

    const promise = (async () => {
      try {
        const { data, error } = await supabase.functions.invoke(`evolution-api/${action}`, {
          method: 'POST',
          body: body ?? {},
        });
        if (error) throw error;
        if (data && typeof data === 'object' && data.error === true) {
          const apiError = Object.assign(
            new Error(data.message || 'Erro na API Evolution'),
            { details: data.details, apiStatus: data.status, retries: data.retries }
          );
          throw apiError;
        }
        return data;
      } catch (error) {
        log.error(`Evolution API error (${action}):`, error);
        throw error;
      } finally {
        if (dedupeKey) inflightRef.current.delete(dedupeKey);
        if (mountedRef.current) setIsLoading(false);
      }
    })();

    if (dedupeKey) inflightRef.current.set(dedupeKey, promise);
    return promise;
  }, []);

  const withToast = useCallback(async (
    action: string,
    body: object | undefined,
    successMsg: string,
    errorMsg: string,
    method: HttpMethod = 'POST'
  ) => {
    try {
      const data = await callApi(action, body, method);
      toast.success(successMsg);
      return data;
    } catch (error) {
      const msg = error instanceof Error ? error.message : errorMsg;
      toast.error(msg);
      throw error;
    }
  }, [callApi]);

  return { isLoading, callApi, withToast };
}
