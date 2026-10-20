import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockToast = vi.fn().mockReturnValue({ id: 'toast-1', dismiss: vi.fn(), update: vi.fn() });

vi.mock('@/hooks/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

import { useActionFeedback } from '@/hooks/ui/useActionFeedback';
import * as feedbackModule from '@/hooks/ui/useActionFeedback';

describe('useActionFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes without error', () => {
    const { result } = renderHook(() => useActionFeedback());
    expect(result.current).toBeDefined();
  });

  it('exposes success function', () => {
    const { result } = renderHook(() => useActionFeedback());
    expect(typeof result.current.success).toBe('function');
  });

  it('exposes error function', () => {
    const { result } = renderHook(() => useActionFeedback());
    expect(typeof result.current.error).toBe('function');
  });

  it('exposes warning function', () => {
    const { result } = renderHook(() => useActionFeedback());
    expect(typeof result.current.warning).toBe('function');
  });

  it('exposes info function', () => {
    const { result } = renderHook(() => useActionFeedback());
    expect(typeof result.current.info).toBe('function');
  });

  it('exposes showFeedback function', () => {
    const { result } = renderHook(() => useActionFeedback());
    expect(typeof result.current.showFeedback).toBe('function');
  });

  it('success calls toast', () => {
    const { result } = renderHook(() => useActionFeedback());

    act(() => {
      result.current.success('Operação concluída');
    });

    expect(mockToast).toHaveBeenCalled();
  });

  it('error calls toast with destructive variant', () => {
    const { result } = renderHook(() => useActionFeedback());

    act(() => {
      result.current.error('Falha na operação');
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' })
    );
  });

  it('showFeedback accepts custom options', () => {
    const { result } = renderHook(() => useActionFeedback());

    act(() => {
      result.current.showFeedback('info', {
        description: 'Custom message',
        title: 'Custom Title',
        duration: 5000,
      });
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Custom Title' })
    );
  });

  it('showFeedback escreve a descrição sem texto de ação entre colchetes', () => {
    const { result } = renderHook(() => useActionFeedback());

    act(() => {
      result.current.showFeedback('success', { description: 'Ação disponível' });
    });

    const callArg = mockToast.mock.calls[0][0];
    expect(callArg.description).toBe('✓ Ação disponível');
    expect(callArg.description).not.toContain('Desfazer');
  });

  it('all feedback types are callable', () => {
    const { result } = renderHook(() => useActionFeedback());
    expect(typeof result.current.success).toBe('function');
    expect(typeof result.current.error).toBe('function');
    expect(typeof result.current.warning).toBe('function');
    expect(typeof result.current.info).toBe('function');
  });

  it('exposes withFeedback for async operations', () => {
    const { result } = renderHook(() => useActionFeedback());
    expect(typeof result.current.withFeedback).toBe('function');
  });
});

describe('useActionFeedback — superfície pública sem helpers de ação mortos', () => {
  it('expõe exatamente as funções vivas de feedback', () => {
    const { result } = renderHook(() => useActionFeedback());
    expect(Object.keys(result.current).sort()).toEqual([
      'error',
      'info',
      'loading',
      'showFeedback',
      'success',
      'warning',
      'withFeedback',
    ]);
  });

  it('exporta apenas o hook useActionFeedback', () => {
    expect(Object.keys(feedbackModule).sort()).toEqual(['useActionFeedback']);
  });
});
