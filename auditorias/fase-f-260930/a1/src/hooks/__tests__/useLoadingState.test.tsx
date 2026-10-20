import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useLoadingState } from '@/hooks/ui/useLoadingState';

import { getLogger } from '@/lib/logger';
const log = getLogger('useLoadingState.test');

describe('useLoadingState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with idle state', () => {
    const { result } = renderHook(() => useLoadingState());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isIdle).toBe(true);
  });

  it('startLoading sets loading state', () => {
    const { result } = renderHook(() => useLoadingState());

    act(() => {
      result.current.startLoading('Loading...');
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.message).toBe('Loading...');
  });

  it('setSuccess changes to success state', () => {
    const { result } = renderHook(() => useLoadingState());

    act(() => {
      result.current.setSuccess('Done!');
    });

    expect(result.current.isSuccess).toBe(true);
    expect(result.current.message).toBe('Done!');
  });

  it('setError changes to error state', () => {
    const { result } = renderHook(() => useLoadingState());

    act(() => {
      result.current.setError('Failed!');
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.message).toBe('Failed!');
  });

  it('reset returns to idle', () => {
    const { result } = renderHook(() => useLoadingState());

    act(() => {
      result.current.startLoading();
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.isIdle).toBe(true);
  });

  it('withLoading wraps async function', async () => {
    const { result } = renderHook(() => useLoadingState());
    const fn = vi.fn().mockResolvedValue('done');

    await act(async () => {
      await result.current.withLoading(fn, {
        loadingMessage: 'Working...',
        successMessage: 'Completed!',
      });
    });

    expect(fn).toHaveBeenCalled();
  });

  it('withLoading handles errors', async () => {
    const { result } = renderHook(() => useLoadingState());
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await act(async () => {
      try {
        await result.current.withLoading(fn, { errorMessage: 'Error!' });
      } catch (err) { log.error('Unexpected error in useLoadingState.test:', err); }
    });
  });
});
