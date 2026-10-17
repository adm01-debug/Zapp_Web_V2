import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { log } from '@/lib/logger';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Tempo máximo que o navegador espera por uma resposta da Edge.
 *
 * A Edge corta cada tentativa de fala com a Evolution em 15 s e já repete, no
 * servidor, os métodos idempotentes (GET/PUT/DELETE). Este limite é a rede de
 * segurança do cliente: sem ele, uma Edge que nunca responde deixava a chamada
 * pendurada para sempre e `isLoading` preso em `true`.
 */
export const EVOLUTION_API_TIMEOUT_MS = 45_000;

/** Erro das chamadas à Evolution, com os campos que o corpo de erro da Edge traz. */
export interface EvolutionApiError extends Error {
  details?: unknown;
  /** Status que a Evolution devolveu (o proxy responde HTTP 200 com `error: true`). */
  apiStatus?: number;
  /** Quantas tentativas o servidor fez antes de desistir (`retries` do proxy). */
  retries?: number;
  /**
   * Espera sugerida pelo servidor (`retryAfter`), já em milissegundos.
   * O proxy atual não manda esse campo; ele fica exposto para quando mandar,
   * para o chamador não precisar reler o corpo do erro.
   */
  retryAfterMs?: number;
  /** `true` quando o navegador desistiu por tempo limite — o servidor não respondeu. */
  timedOut?: boolean;
}

/** Converte `retryAfter` (segundos ou data HTTP) em milissegundos. Ausente/inválido → undefined. */
export function parseRetryAfter(raw: unknown): number | undefined {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw * 1000) : undefined;
  }
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.floor(seconds * 1000);
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

/**
 * Opções do `functions.invoke` no mesmo formato visível de antes (`method` +
 * `body`): os testes de contrato destes hooks (`useEvolutionGroups`,
 * `useEvolutionMessaging`) comparam o objeto inteiro e o corpo que a Edge
 * recebe é só o payload.
 *
 * O `signal` do teto de tempo entra como propriedade NÃO enumerável — o
 * supabase-js o lê igual (`options.signal` → `fetch`), mas ele não passa a
 * fazer parte do contrato observável nem do payload.
 */
function invokeOptionsWithSignal(body: object, signal: AbortSignal) {
  const options: { method: 'POST'; body: object; signal?: AbortSignal } = { method: 'POST', body };
  Object.defineProperty(options, 'signal', {
    value: signal,
    enumerable: false,
    configurable: true,
    writable: false,
  });
  return options;
}

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
      const controller = new AbortController();
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, EVOLUTION_API_TIMEOUT_MS);

      try {
        const { data, error } = await supabase.functions.invoke(
          `evolution-api/${action}`,
          invokeOptionsWithSignal(body ?? {}, controller.signal)
        );
        if (error) throw error;
        if (data && typeof data === 'object' && data.error === true) {
          const apiError = Object.assign(
            new Error(data.message || 'Erro na API Evolution'),
            {
              details: data.details,
              apiStatus: data.status,
              retries: data.retries,
              retryAfterMs: parseRetryAfter(data.retryAfter ?? data.retry_after),
            }
          );
          throw apiError;
        }
        return data;
      } catch (error) {
        if (timedOut) {
          const timeoutError = Object.assign(
            new Error(
              `A Evolution não respondeu em ${EVOLUTION_API_TIMEOUT_MS / 1000} segundos. Tente novamente.`
            ),
            { timedOut: true }
          );
          log.error(`Evolution API timeout (${action}):`, timeoutError.message);
          throw timeoutError;
        }
        log.error(`Evolution API error (${action}):`, error);
        throw error;
      } finally {
        clearTimeout(timeoutId);
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
