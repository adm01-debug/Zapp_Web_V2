import { useState, useCallback } from 'react';
import { toast } from '@/hooks/ui/use-toast';
import { getLogger } from '@/lib/logger';

const log = getLogger('useSupabaseMutation');

interface MutationOptions<T> {
  /** Success toast message */
  successMessage?: string;
  /** Error toast title */
  errorMessage?: string;
  /** Called after successful mutation */
  onSuccess?: (data: T) => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

interface MutationResult<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  mutate: () => Promise<T | null>;
  reset: () => void;
}

/**
 * Standardized hook for Supabase mutations with consistent error handling,
 * toast notifications, and loading state management.
 *
 * @example
 * const { mutate, isLoading } = useSupabaseMutation(
 *   () => supabase.from('products').insert(payload),
 *   { successMessage: 'Produto criado!', errorMessage: 'Erro ao criar produto' }
 * );
 */
export function useSupabaseMutation<T = unknown>(
  mutationFn: () => Promise<{ data: T | null; error: { message: string } | null }>,
  options: MutationOptions<T> = {},
): MutationResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  const mutate = useCallback(async (): Promise<T | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await mutationFn();
      if (result.error) {
        throw new Error(result.error.message);
      }
      setData(result.data);
      if (options.successMessage) {
        toast({ title: options.successMessage });
      }
      options.onSuccess?.(result.data as T);
      return result.data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Erro desconhecido');
      setError(error);
      log.error('Mutation failed:', error.message);
      toast({
        title: options.errorMessage || 'Erro na operação',
        description: error.message,
        variant: 'destructive',
      });
      options.onError?.(error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [mutationFn, options]);

  return { data, error, isLoading, mutate, reset };
}
