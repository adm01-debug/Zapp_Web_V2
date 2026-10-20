import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useTextToSpeech } from '@/hooks/communication/useTextToSpeech';

describe('useTextToSpeech', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with isLoading false', () => {
    const { result } = renderHook(() => useTextToSpeech());
    expect(result.current.isLoading).toBe(false);
  });

  it('initializes with isPlaying false', () => {
    const { result } = renderHook(() => useTextToSpeech());
    expect(result.current.isPlaying).toBe(false);
  });

  it('initializes with null currentMessageId', () => {
    const { result } = renderHook(() => useTextToSpeech());
    expect(result.current.currentMessageId).toBeNull();
  });

  it('initializes with default voiceId', () => {
    const { result } = renderHook(() => useTextToSpeech());
    expect(result.current.voiceId).toBe('TY3h8ANhQUsJaa0Bga5F');
  });

  it('accepts custom initial voiceId', () => {
    const { result } = renderHook(() => useTextToSpeech({ initialVoiceId: 'custom-voice' }));
    expect(result.current.voiceId).toBe('custom-voice');
  });

  it('initializes with default speed 1.0', () => {
    const { result } = renderHook(() => useTextToSpeech());
    expect(result.current.speed).toBe(1.0);
  });

  it('accepts custom initial speed', () => {
    const { result } = renderHook(() => useTextToSpeech({ initialSpeed: 1.5 }));
    expect(result.current.speed).toBe(1.5);
  });

  it('exposes speak function', () => {
    const { result } = renderHook(() => useTextToSpeech());
    expect(typeof result.current.speak).toBe('function');
  });

  it('exposes stop function', () => {
    const { result } = renderHook(() => useTextToSpeech());
    expect(typeof result.current.stop).toBe('function');
  });

  it('setVoiceId updates voice', () => {
    const { result } = renderHook(() => useTextToSpeech());
    act(() => { result.current.setVoiceId('new-voice'); });
    expect(result.current.voiceId).toBe('new-voice');
  });

  it('setSpeed clamps to max 2.0', () => {
    const { result } = renderHook(() => useTextToSpeech());
    act(() => { result.current.setSpeed(5.0); });
    expect(result.current.speed).toBe(2.0);
  });

  it('setSpeed clamps to min 0.5', () => {
    const { result } = renderHook(() => useTextToSpeech());
    act(() => { result.current.setSpeed(0.1); });
    expect(result.current.speed).toBe(0.5);
  });

  it('setSpeed accepts normal value', () => {
    const { result } = renderHook(() => useTextToSpeech());
    act(() => { result.current.setSpeed(1.25); });
    expect(result.current.speed).toBe(1.25);
  });

  it('calls onVoiceChange callback', () => {
    const onVoiceChange = vi.fn();
    const { result } = renderHook(() => useTextToSpeech({ onVoiceChange }));
    act(() => { result.current.setVoiceId('test'); });
    expect(onVoiceChange).toHaveBeenCalledWith('test');
  });

  it('calls onSpeedChange callback', () => {
    const onSpeedChange = vi.fn();
    const { result } = renderHook(() => useTextToSpeech({ onSpeedChange }));
    act(() => { result.current.setSpeed(1.5); });
    expect(onSpeedChange).toHaveBeenCalledWith(1.5);
  });
});
