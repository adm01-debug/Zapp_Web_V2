import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn().mockReturnValue('toast-id'), {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import { useUndoableAction } from '@/hooks/system/useUndoableAction';

import { getLogger } from '@/lib/logger';
const log = getLogger('useUndoableAction.test');

describe('useUndoableAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useUndoableAction());
    expect(result.current.isPending).toBe(false);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.timeRemaining).toBe(0);
  });

  it('exposes execute and cancelPendingAction functions', () => {
    const { result } = renderHook(() => useUndoableAction());
    expect(typeof result.current.execute).toBe('function');
    expect(typeof result.current.cancelPendingAction).toBe('function');
  });

  it('execute runs action', async () => {
    const { result } = renderHook(() => useUndoableAction());
    const mockAction = vi.fn().mockResolvedValue('result');
    const mockUndo = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      await result.current.execute({
        action: mockAction,
        undoAction: mockUndo,
        successMessage: 'Done!',
        undoDuration: 5000,
      });
    });

    expect(mockAction).toHaveBeenCalled();
  });

  it('handles action failure gracefully', async () => {
    const { result } = renderHook(() => useUndoableAction());
    const mockAction = vi.fn().mockRejectedValue(new Error('fail'));
    const mockUndo = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      try {
        await result.current.execute({
          action: mockAction,
          undoAction: mockUndo,
          successMessage: 'Done!',
        });
      } catch (err) { log.error('Unexpected error in useUndoableAction.test:', err); }
    });

    expect(mockAction).toHaveBeenCalled();
  });

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useUndoableAction());
    expect(() => unmount()).not.toThrow();
  });
});
