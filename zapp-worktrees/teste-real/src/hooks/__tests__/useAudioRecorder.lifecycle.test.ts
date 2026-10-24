import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// MediaRecorder fake com a mesma semantica de evento do real: start() grava e
// stop() dispara onstop. As instancias ficam acessiveis para o teste inspecionar.
class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  state: 'inactive' | 'recording' = 'inactive';
  start = vi.fn(() => {
    this.state = 'recording';
  });
  stop = vi.fn(() => {
    this.state = 'inactive';
    this.onstop?.();
  });
  constructor(public stream: unknown) {
    FakeMediaRecorder.instances.push(this);
  }
}

function makeMediaStream() {
  const track = { stop: vi.fn(), kind: 'audio', readyState: 'live' };
  const stream = { getTracks: () => [track] };
  return { stream, track };
}

// R2-INB-008 — o defeito era de closure: stop/cancel guardavam com o estado
// isRecording do primeiro render (sempre false) e o hook nao tinha cleanup de
// desmonte, entao a captura continuava no limite de duracao e depois do unmount.
describe('useAudioRecorder — ciclo de vida da captura (R2-INB-008)', () => {
  const getUserMedia = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    FakeMediaRecorder.instances = [];
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:fake'),
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('interrompe MediaRecorder, tracks e o timer ao atingir maxDuration', async () => {
    const { stream, track } = makeMediaStream();
    getUserMedia.mockResolvedValue(stream);

    const { result } = renderHook(() => useAudioRecorder({ maxDuration: 2 }));
    await act(async () => {
      await result.current.startRecording();
    });

    const recorder = FakeMediaRecorder.instances[0];
    expect(result.current.isRecording).toBe(true);
    expect(recorder.state).toBe('recording');

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(result.current.isRecording).toBe(false);
  });

  it('interrompe MediaRecorder, tracks e o timer ao desmontar durante a gravacao', async () => {
    const { stream, track } = makeMediaStream();
    getUserMedia.mockResolvedValue(stream);
    const onRecordingComplete = vi.fn();

    const { result, unmount } = renderHook(() => useAudioRecorder({ onRecordingComplete }));
    await act(async () => {
      await result.current.startRecording();
    });

    const recorder = FakeMediaRecorder.instances[0];
    unmount();

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    // Unmount descarta a gravacao: nao emite blob para um componente que ja saiu.
    expect(onRecordingComplete).not.toHaveBeenCalled();
  });

  it('devolve as tracks se o getUserMedia resolver depois do unmount', async () => {
    let resolveStream!: (stream: unknown) => void;
    getUserMedia.mockReturnValue(
      new Promise((resolve) => {
        resolveStream = resolve;
      }),
    );

    const { result, unmount } = renderHook(() => useAudioRecorder());
    await act(async () => {
      void result.current.startRecording();
    });
    unmount();

    const { stream, track } = makeMediaStream();
    await act(async () => {
      resolveStream(stream);
      await Promise.resolve();
    });

    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stopRecording entrega o blob gravado e libera a captura', async () => {
    const { stream, track } = makeMediaStream();
    getUserMedia.mockResolvedValue(stream);
    const onRecordingComplete = vi.fn();

    const { result } = renderHook(() => useAudioRecorder({ onRecordingComplete }));
    await act(async () => {
      await result.current.startRecording();
    });

    const recorder = FakeMediaRecorder.instances[0];
    act(() => {
      recorder.ondataavailable?.({ data: new Blob(['audio']) });
      result.current.stopRecording();
    });

    expect(onRecordingComplete).toHaveBeenCalledTimes(1);
    expect(onRecordingComplete.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(result.current.isRecording).toBe(false);
  });

  it('cancelRecording libera a captura sem emitir onRecordingComplete', async () => {
    const { stream, track } = makeMediaStream();
    getUserMedia.mockResolvedValue(stream);
    const onRecordingComplete = vi.fn();

    const { result } = renderHook(() => useAudioRecorder({ onRecordingComplete }));
    await act(async () => {
      await result.current.startRecording();
    });

    const recorder = FakeMediaRecorder.instances[0];
    act(() => {
      recorder.ondataavailable?.({ data: new Blob(['audio']) });
      result.current.cancelRecording();
    });

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(onRecordingComplete).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(result.current.isRecording).toBe(false);
  });
});
