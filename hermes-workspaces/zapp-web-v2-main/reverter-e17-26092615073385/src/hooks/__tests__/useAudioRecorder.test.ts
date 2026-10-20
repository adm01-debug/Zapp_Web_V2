import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test.webm' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/test.webm' } }),
      }),
    },
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useAudioRecorder } from '@/hooks/communication/useAudioRecorder';

describe('useAudioRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with isRecording false', () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(result.current.isRecording).toBe(false);
  });

  it('initializes with duration 0', () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(result.current.duration).toBe(0);
  });

  it('initializes with audioUrl null', () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(result.current.audioUrl).toBeNull();
  });

  it('exposes startRecording function', () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(typeof result.current.startRecording).toBe('function');
  });

  it('exposes stopRecording function', () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(typeof result.current.stopRecording).toBe('function');
  });

  it('exposes cancelRecording function', () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(typeof result.current.cancelRecording).toBe('function');
  });

  it('exposes uploadAudio function', () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(typeof result.current.uploadAudio).toBe('function');
  });

  it('returns a stable storage object URL after upload', async () => {
    const { result } = renderHook(() => useAudioRecorder());

    let objectUrl: string | undefined;
    await act(async () => {
      objectUrl = await result.current.uploadAudio(new Blob(['audio']), 'conversation-1');
    });

    expect(objectUrl).toBe('https://example.com/test.webm');
  });

  it('exposes formatDuration function', () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(typeof result.current.formatDuration).toBe('function');
  });

  it('formatDuration formats 0 seconds', () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(result.current.formatDuration(0)).toBe('0:00');
  });

  it('formatDuration formats 65 seconds', () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(result.current.formatDuration(65)).toBe('1:05');
  });

  it('formatDuration formats 300 seconds (5 min)', () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(result.current.formatDuration(300)).toBe('5:00');
  });

  it('formatDuration formats 9 seconds with leading zero', () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(result.current.formatDuration(9)).toBe('0:09');
  });

  it('formatDuration formats 130 seconds', () => {
    const { result } = renderHook(() => useAudioRecorder());
    expect(result.current.formatDuration(130)).toBe('2:10');
  });

  it('accepts maxDuration option', () => {
    const { result } = renderHook(() => useAudioRecorder({ maxDuration: 60 }));
    expect(result.current.isRecording).toBe(false);
  });

  it('accepts onRecordingComplete callback', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useAudioRecorder({ onRecordingComplete: callback }));
    expect(result.current.isRecording).toBe(false);
  });
});
