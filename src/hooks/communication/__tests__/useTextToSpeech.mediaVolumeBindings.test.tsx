import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * R2-INB-041 — "Parar TTS e prévias de memes conserva inscrições dos players descartados".
 *
 * `attachMediaVolume` devolve o `detach` que remove listeners, a inscrição no store global
 * de volume e o ganho WebAudio. No TTS esse detach vivia apenas dentro de `onended`/
 * `onerror`: `stop()` e o desmonte do painel descartavam o Audio mantendo a inscrição.
 * O bind aqui é o REAL (`mediaVolumeElement` + `mediaVolumeStore`) sobre um Audio
 * simulado; a retenção é provada pelo comportamento — o player descartado não pode mais
 * reagir ao volume global nem continuar com os listeners de `play`/`loadedmetadata`.
 */

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://local.test',
}));

vi.mock('@/lib/edgeAuthHeaders', () => ({
  edgeAuthHeaders: vi.fn(async () => ({ apikey: 'test-key', Authorization: 'Bearer test' })),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { useTextToSpeech } from '@/hooks/communication/useTextToSpeech';
import { setMuted, setVolume, toGain } from '@/lib/mediaVolumeStore';
import { toast } from 'sonner';

/** Audio simulado com registro real de listeners (o bind remove `play`/`loadedmetadata`). */
class FakeAudio {
  static instances: FakeAudio[] = [];
  static playRejects = false;

  volume = 1;
  muted = false;
  currentTime = 0;
  playbackRate = 1;
  preload = '';
  src: string;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onplay: (() => void) | null = null;

  private listeners = new Map<string, Set<EventListener>>();

  constructor(url?: string) {
    this.src = url ?? '';
    FakeAudio.instances.push(this);
  }

  play = vi.fn(() => {
    if (FakeAudio.playRejects) return Promise.reject(new Error('NotAllowedError'));
    this.onplay?.();
    return Promise.resolve();
  });

  pause = vi.fn();
  load = vi.fn();
  removeAttribute = vi.fn();

  addEventListener = (type: string, listener: EventListener) => {
    const set = this.listeners.get(type) ?? new Set<EventListener>();
    set.add(listener);
    this.listeners.set(type, set);
  };

  removeEventListener = (type: string, listener: EventListener) => {
    this.listeners.get(type)?.delete(listener);
  };

  inscritoNoVolume(): boolean {
    return (this.listeners.get('play')?.size ?? 0) > 0
      && (this.listeners.get('loadedmetadata')?.size ?? 0) > 0;
  }

  terminar(): void {
    this.onended?.();
  }
}

const playersVivos = () => FakeAudio.instances.filter((audio) => audio.inscritoNoVolume());

describe('useTextToSpeech — inscrições do player descartado (R2-INB-041)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeAudio.instances = [];
    FakeAudio.playRejects = false;
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      blob: async () => new Blob(['audio-mp3'], { type: 'audio/mpeg' }),
    })));
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:fake-tts');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    setMuted(false);
    setVolume(80);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stop() solta o bind: a fala interrompida para de reagir ao volume global', async () => {
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => { await result.current.speak('mensagem um'); });

    const audio = FakeAudio.instances[0];
    expect(audio.inscritoNoVolume()).toBe(true);

    act(() => { setVolume(50); });
    expect(audio.volume).toBeCloseTo(toGain(50), 5);
    const volumeAntesDeParar = audio.volume;

    act(() => { result.current.stop(); });

    expect(audio.pause).toHaveBeenCalled();
    expect(audio.inscritoNoVolume()).toBe(false);
    act(() => { setVolume(100); });
    expect(audio.volume).toBeCloseTo(volumeAntesDeParar, 5);
  });

  it('iniciar outra fala solta o binding antigo e mantém um só player vivo', async () => {
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => { await result.current.speak('primeira fala'); });
    expect(playersVivos()).toHaveLength(1);

    await act(async () => { await result.current.speak('segunda fala'); });

    expect(FakeAudio.instances).toHaveLength(2);
    expect(FakeAudio.instances[0].inscritoNoVolume()).toBe(false);
    expect(FakeAudio.instances[1].inscritoNoVolume()).toBe(true);
    expect(playersVivos()).toHaveLength(1);
  });

  it('desmontar o painel solta o bind da fala em andamento', async () => {
    const { result, unmount } = renderHook(() => useTextToSpeech());

    await act(async () => { await result.current.speak('fala viva'); });
    const audio = FakeAudio.instances[0];
    expect(audio.inscritoNoVolume()).toBe(true);

    unmount();

    expect(audio.inscritoNoVolume()).toBe(false);
    expect(playersVivos()).toHaveLength(0);
  });

  it('falha ao tocar também descarta o player (erro solta o bind)', async () => {
    FakeAudio.playRejects = true;
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => { await result.current.speak('fala que falha'); });

    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].inscritoNoVolume()).toBe(false);
    expect(playersVivos()).toHaveLength(0);
    expect(toast.error).toHaveBeenCalled();
  });

  it('terminar naturalmente (onended) solta o bind e a URL do próprio áudio', async () => {
    const { result } = renderHook(() => useTextToSpeech());

    await act(async () => { await result.current.speak('fala curta'); });
    const audio = FakeAudio.instances[0];

    act(() => { audio.terminar(); });

    expect(audio.inscritoNoVolume()).toBe(false);
    expect(playersVivos()).toHaveLength(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-tts');
  });
});
