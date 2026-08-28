import { useState, useCallback, useTransition } from 'react';

type LoadingType = 'idle' | 'loading' | 'success' | 'error';

interface UseLoadingStateOptions {
  /** Minimum loading time in ms to prevent flicker */
  minLoadingTime?: number;
  /** Auto-reset to idle after success/error */
  autoReset?: boolean;
  /** Time in ms to auto-reset */
  autoResetDelay?: number;
}

interface LoadingState {
  type: LoadingType;
  message?: string;
}

/**
 * Standardized loading state hook for consistent UX across the app.
 * 
 * Usage:
 * ```tsx
 * const { state, startLoading, setSuccess, setError, reset, withLoading } = useLoadingState();
 * 
 * // Option 1: Manual control
 * startLoading('Salvando...');
 * await saveData();
 * setSuccess('Salvo!');
 * 
 * // Option 2: Wrapper function
 * await withLoading(
 *   () => saveData(),
 *   { loadingMessage: 'Salvando...', successMessage: 'Salvo!' }
 * );
 * ```
 */
export function useLoadingState(options: UseLoadingStateOptions = {}) {
  const {
    minLoadingTime = 300,
    autoReset = true,
    autoResetDelay = 2000,
  } = options;

  const [state, setState] = useState<LoadingState>({ type: 'idle' });
  const [isPending, startTransition] = useTransition();

  const reset = useCallback(() => {
    setState({ type: 'idle' });
  }, []);

  const startLoading = useCallback((message?: string) => {
    setState({ type: 'loading', message });
  }, []);

  const setSuccess = useCallback((message?: string) => {
    setState({ type: 'success', message });
    if (autoReset) {
      setTimeout(reset, autoResetDelay);
    }
  }, [autoReset, autoResetDelay, reset]);

  const setError = useCallback((message?: string) => {
    setState({ type: 'error', message });
    if (autoReset) {
      setTimeout(reset, autoResetDelay);
    }
  }, [autoReset, autoResetDelay, reset]);

  const withLoading = useCallback(async <T>(
    fn: () => Promise<T>,
    options?: {
      loadingMessage?: string;
      successMessage?: string;
      errorMessage?: string;
    }
  ): Promise<T | undefined> => {
    const startTime = Date.now();
    startLoading(options?.loadingMessage);

    try {
      const result = await fn();
      
      // Ensure minimum loading time to prevent flicker
      const elapsed = Date.now() - startTime;
      if (elapsed < minLoadingTime) {
        await new Promise(resolve => setTimeout(resolve, minLoadingTime - elapsed));
      }
      
      setSuccess(options?.successMessage);
      return result;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      if (elapsed < minLoadingTime) {
        await new Promise(resolve => setTimeout(resolve, minLoadingTime - elapsed));
      }
      
      setError(options?.errorMessage || (error instanceof Error ? error.message : 'Erro'));
      return undefined;
    }
  }, [startLoading, setSuccess, setError, minLoadingTime]);

  return {
    state,
    isLoading: state.type === 'loading' || isPending,
    isSuccess: state.type === 'success',
    isError: state.type === 'error',
    isIdle: state.type === 'idle',
    message: state.message,
    startLoading,
    setSuccess,
    setError,
    reset,
    withLoading,
    startTransition,
  };
}

/**
 * Determines the appropriate skeleton type for different content types
 */
export type SkeletonContext = 
  | 'list'      // Use Skeleton list items
  | 'card'      // Use SkeletonCard with shimmer
  | 'inline'    // Use inline spinner
  | 'fullpage'  // Use FullPageLoading
  | 'table';    // Use TableLoading

export function getSkeletonType(context: {
  isFirstLoad: boolean;
  hasData: boolean;
  contentType: 'list' | 'card' | 'table' | 'action' | 'page';
}): SkeletonContext {
  const { isFirstLoad, hasData, contentType } = context;

  // First load without data: show appropriate skeleton
  if (isFirstLoad && !hasData) {
    switch (contentType) {
      case 'list': return 'list';
      case 'card': return 'card';
      case 'table': return 'table';
      case 'page': return 'fullpage';
      default: return 'inline';
    }
  }

  // Subsequent loads with existing data: use inline loading
  return 'inline';
}
