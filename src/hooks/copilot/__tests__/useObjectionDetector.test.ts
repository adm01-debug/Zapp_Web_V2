import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useObjectionDetector } from '../useObjectionDetector';

// Speed up debounce in tests
vi.useFakeTimers();

describe('useObjectionDetector', () => {
  beforeEach(() => {
    vi.clearAllTimers();
  });

  it('detects price objection from "muito caro"', async () => {
    const { result } = renderHook(() =>
      useObjectionDetector({
        conversationId: 'conv-1',
        messages: ['esse produto é muito caro'],
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(result.current.objection).not.toBeNull();
    expect(result.current.objection?.type).toBe('price');
  });

  it('detects delay objection from "vou pensar"', async () => {
    const { result } = renderHook(() =>
      useObjectionDetector({
        conversationId: 'conv-2',
        messages: ['vou pensar e te falo'],
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(result.current.objection).not.toBeNull();
    expect(result.current.objection?.type).toBe('delay');
  });

  it('detects competitor objection from "outro fornecedor"', async () => {
    const { result } = renderHook(() =>
      useObjectionDetector({
        conversationId: 'conv-3',
        messages: ['vi em outro fornecedor mais barato'],
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(result.current.objection).not.toBeNull();
    expect(result.current.objection?.type).toBe('competitor');
  });

  it('returns 4-step treatment script', async () => {
    const { result } = renderHook(() =>
      useObjectionDetector({
        conversationId: 'conv-4',
        messages: ['esse preço está muito caro'],
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(result.current.objection?.script).toHaveLength(4);
    expect(result.current.objection?.script[0]).toContain('Acolher');
    expect(result.current.objection?.script[1]).toContain('Causa');
    expect(result.current.objection?.script[2]).toContain('Valor');
    expect(result.current.objection?.script[3]).toContain('Checar');
  });

  it('dismiss clears the objection', async () => {
    const { result } = renderHook(() =>
      useObjectionDetector({
        conversationId: 'conv-5',
        messages: ['muito caro'],
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(result.current.objection).not.toBeNull();

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.objection).toBeNull();
  });

  it('calls onObjectionDetected callback when objection is found', async () => {
    const onObjectionDetected = vi.fn();

    renderHook(() =>
      useObjectionDetector({
        conversationId: 'conv-6',
        messages: ['quero algo mais barato'],
        onObjectionDetected,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(onObjectionDetected).toHaveBeenCalledOnce();
    expect(onObjectionDetected).toHaveBeenCalledWith(
      expect.objectContaining({ type: expect.any(String), script: expect.any(Array) }),
    );
  });

  it('returns null objection when no keywords match', async () => {
    const { result } = renderHook(() =>
      useObjectionDetector({
        conversationId: 'conv-7',
        messages: ['gostei muito do produto, pode me enviar o catálogo?'],
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(result.current.objection).toBeNull();
  });
});
