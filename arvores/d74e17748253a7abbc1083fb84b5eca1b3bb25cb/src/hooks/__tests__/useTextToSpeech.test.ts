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

  // Os dois "sync with external X changes" eram effects com setState sincrono
  // (react-hooks/set-state-in-effect) e viraram derivacao no render. Estes testes pinam a semantica
  // que os effects davam: prop nova vence o valor local; sem prop nova, a escolha local permanece.
  describe('prop externa x escolha local', () => {
    it('voz: escolha local vale ate chegar prop nova, e a prop nova vence', () => {
      const { result, rerender } = renderHook(
        (props: { voz: string | undefined }) => useTextToSpeech({ initialVoiceId: props.voz }),
        { initialProps: { voz: 'voz-a' } },
      );
      expect(result.current.voiceId).toBe('voz-a');

      act(() => { result.current.setVoiceId('voz-local'); });
      expect(result.current.voiceId).toBe('voz-local');

      // mesmo valor de prop: a escolha local continua
      rerender({ voz: 'voz-a' });
      expect(result.current.voiceId).toBe('voz-local');

      // prop nova: vence o valor local (comportamento do effect antigo)
      rerender({ voz: 'voz-b' });
      expect(result.current.voiceId).toBe('voz-b');
    });

    it('velocidade: prop nova vence o valor local e o clamp continua valendo', () => {
      const { result, rerender } = renderHook(
        (props: { velocidade: number | undefined }) => useTextToSpeech({ initialSpeed: props.velocidade }),
        { initialProps: { velocidade: 1.0 } },
      );

      act(() => { result.current.setSpeed(1.75); });
      expect(result.current.speed).toBe(1.75);

      rerender({ velocidade: 1.0 });
      expect(result.current.speed).toBe(1.75);

      rerender({ velocidade: 1.25 });
      expect(result.current.speed).toBe(1.25);
    });

    it('sem prop externa, a escolha local nao e sobrescrita por render', () => {
      const { result, rerender } = renderHook(() => useTextToSpeech());
      act(() => { result.current.setSpeed(1.5); });
      rerender();
      expect(result.current.speed).toBe(1.5);
    });
  });
});
