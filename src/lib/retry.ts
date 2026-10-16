import { getLogger, generateCorrelationId } from '@/lib/logger';
import { secureRandomFloat } from './secureRandom';
import { isIntentionalAbort, isAbortLikeError } from '@/lib/abortError';

const log = getLogger('RetryUtil');

// Re-exportado de @/lib/abortError (módulo puro, sem dependência de logger)
// para não quebrar callers existentes que importam daqui.
export { isIntentionalAbort, isAbortLikeError };

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number) => void;
}

/**
 * Resilient retry wrapper with exponential backoff and jitter.
 * Works with any async operation (Supabase, fetch, etc).
 *
 * @example
 * const data = await withRetry(() => supabase.from('contacts').select('*'), {
 *   maxRetries: 3,
 *   shouldRetry: (err) => !isAbortLikeError(err),
 *   onRetry: (err, attempt) => console.log(`Retry ${attempt}`, err),
 * });
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    // PADRÃO SEGURO: não repete sem política explícita.
    // `() => true` repetiria TUDO, inclusive AbortError (page unload /
    // navegação), produzindo cascatas "[RetryUtil] All N retries exhausted
    // AbortError: Page unload". Cada chamador DEVE passar um `shouldRetry`
    // explícito que exclua abortos.
    shouldRetry = () => false,
    onRetry,
  } = options;

  const correlationId = generateCorrelationId('retry');
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Aborto intencional (page unload / navegação): nunca repete, nunca é
      // logado como ERROR. O navegador aborta todos os fetches em voo no
      // unload; este guard casa por `err.name` e tem precedência sobre
      // `shouldRetry`.
      if (isIntentionalAbort(error)) {
        log.debug(
          `[${correlationId}] Request aborted (attempt ${attempt + 1}) — not retrying`,
          error
        );
        throw error;
      }

      // Erro real, mas a política de retry diz que não é retentável.
      if (!shouldRetry(error, attempt)) {
        log.warn(
          `[${correlationId}] Not retryable — aborting after ${attempt + 1} attempt(s)`,
          error
        );
        throw error;
      }

      // Retentáveis genuínos esgotados.
      if (attempt >= maxRetries) {
        log.error(
          `[${correlationId}] All ${maxRetries} retries exhausted`,
          error
        );
        throw error;
      }

      // Exponential backoff with jitter. O jitter so entra no setTimeout: nao e
      // gravado, comparado por regex nem enviado ao banco. A fonte deixa de ser
      // o PRNG previsivel (S2245); a formula segue identica.
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + secureRandomFloat() * 500,
        maxDelayMs
      );

      log.warn(
        `[${correlationId}] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(delay)}ms`
      );

      onRetry?.(error, attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Convenience: retry only on network-like errors (not 4xx client errors).
 */
export async function withNetworkRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  return withRetry(operation, {
    maxRetries,
    shouldRetry: (error) => {
      // NUNCA repete requisições abortadas (page unload, navegação): o
      // navegador aborta todos os fetches em voo no unload e repetir só
      // produz cascata de "All N retries exhausted" no console.
      if (error instanceof Error && error.name === 'AbortError') return false;
      if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        const status = (error as unknown as { status?: number }).status;
        if (typeof status === 'number' && status >= 500) return true;
        // Fronteira de palavra impede '502' casar dentro de '5024' ou de URL
        return (
          msg.includes('fetch') ||
          msg.includes('network') ||
          msg.includes('timeout') ||
          /\b(502|503|504)\b/.test(msg)
        );
      }
      return false;
    },
  });
}
