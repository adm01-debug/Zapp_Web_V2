import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * R2-INB-041 — "Parar TTS e prévias de memes conserva inscrições dos players descartados".
 *
 * `attachMediaVolume` devolve o `detach` que remove os listeners do elemento, a inscrição
 * no store global de volume e o ganho WebAudio. Nas prévias de meme esse detach vivia
 * dentro de `onended`: pausar, trocar de prévia, enviar, fechar o picker ou desmontar
 * descartava o Audio mantendo a inscrição. Aqui o bind é o REAL (`mediaVolumeElement` +
 * `mediaVolumeStore`) sobre um Audio simulado; a prova de retenção é comportamental —
 * depois de descartado, o player não pode mais reagir ao volume global nem continuar
 * com os listeners de `play`/`loadedmetadata`.
 */

const memesDoBackend = [
  {
    id: 'meme-1', name: 'Primeiro', audio_url: 'https://cdn.test/meme-1.mp3',
    category: 'engracado', duration_seconds: 3, is_favorite: false, use_count: 0,
  },
  {
    id: 'meme-2', name: 'Segundo', audio_url: 'https://cdn.test/meme-2.mp3',
    category: 'engracado', duration_seconds: 4, is_favorite: false, use_count: 1,
  },
];

const supabaseMock = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: supabaseMock.rpc },
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

import { useAudioMemes, type AudioMemeItem } from '@/hooks/communication/useAudioMemes';
import { setMuted, setVolume, toGain } from '@/lib/mediaVolumeStore';

/** Audio simulado com registro de listeners de verdade (o bind remove `play`/`loadedmetadata`). */
class FakeAudio {
  static instances: FakeAudio[] = [];

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

  /** O bind de volume está vivo neste elemento? */
  inscritoNoVolume(): boolean {
    return (this.listeners.get('play')?.size ?? 0) > 0
      && (this.listeners.get('loadedmetadata')?.size ?? 0) > 0;
  }

  /** Simula o fim natural da prévia. */
  terminar(): void {
    this.onended?.();
  }
}

const previews = () => FakeAudio.instances.filter((audio) => audio.inscritoNoVolume());

describe('useAudioMemes — inscrições dos players de prévia (R2-INB-041)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeAudio.instances = [];
    vi.stubGlobal('Audio', FakeAudio);
    // Store global em estado conhecido: 80% → ganho 0.64.
    setMuted(false);
    setVolume(80);
    supabaseMock.rpc.mockImplementation(async (name: string) => {
      if (name === 'fn_list_audio_memes_for_user') return { data: memesDoBackend, error: null };
      return { data: null, error: null };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function montar() {
    const utils = renderHook(() => useAudioMemes(true));
    await waitFor(() => expect(utils.result.current.memes).toHaveLength(2));
    return utils;
  }

  it('pausar a mesma prévia solta o bind: o player descartado para de reagir ao volume global', async () => {
    const { result } = await montar();
    const meme = memesDoBackend[0] as AudioMemeItem;

    act(() => { result.current.handlePreview(meme); });
    const audio = FakeAudio.instances[0];
    expect(audio.inscritoNoVolume()).toBe(true);

    // Enquanto a prévia está viva, o volume global chega nela.
    act(() => { setVolume(50); });
    expect(audio.volume).toBeCloseTo(toGain(50), 5);

    const volumeAntesDeParar = audio.volume;
    act(() => { result.current.handlePreview(meme); }); // mesmo id = parar

    expect(audio.inscritoNoVolume()).toBe(false);
    act(() => { setVolume(100); });
    // Se a inscrição tivesse ficado retida, o valor mudaria para 1.
    expect(audio.volume).toBeCloseTo(volumeAntesDeParar, 5);
    expect(result.current.playingId).toBeNull();
  });

  it('trocar de prévia devolve a contagem de bindings ao valor anterior', async () => {
    const { result } = await montar();

    act(() => { result.current.handlePreview(memesDoBackend[0] as AudioMemeItem); });
    expect(previews()).toHaveLength(1);

    act(() => { result.current.handlePreview(memesDoBackend[1] as AudioMemeItem); });
    // A troca descarta a primeira: continua exatamente 1 binding vivo, o novo.
    expect(previews()).toHaveLength(1);
    expect(FakeAudio.instances[0].inscritoNoVolume()).toBe(false);
    expect(FakeAudio.instances[1].inscritoNoVolume()).toBe(true);

    act(() => { result.current.handlePreview(memesDoBackend[1] as AudioMemeItem); });
    expect(previews()).toHaveLength(0);
  });

  it('enviar o meme solta o bind da prévia em vez de só pausar', async () => {
    const { result } = await montar();
    const meme = memesDoBackend[0] as AudioMemeItem;

    act(() => { result.current.handlePreview(meme); });
    const audio = FakeAudio.instances[0];

    await act(async () => {
      await result.current.handleSend(meme, vi.fn(), vi.fn());
    });

    expect(audio.pause).toHaveBeenCalled();
    expect(audio.inscritoNoVolume()).toBe(false);
    expect(previews()).toHaveLength(0);
  });

  it('cleanup do picker solta o bind e devolve a contagem ao valor anterior', async () => {
    const { result } = await montar();

    act(() => { result.current.handlePreview(memesDoBackend[0] as AudioMemeItem); });
    expect(previews()).toHaveLength(1);

    act(() => { result.current.cleanup(); });
    expect(previews()).toHaveLength(0);
  });

  it('desmontar o picker solta o bind do player descartado', async () => {
    const { result, unmount } = await montar();

    act(() => { result.current.handlePreview(memesDoBackend[0] as AudioMemeItem); });
    const audio = FakeAudio.instances[0];
    expect(audio.inscritoNoVolume()).toBe(true);

    unmount();

    expect(audio.inscritoNoVolume()).toBe(false);
  });

  it('terminar naturalmente (onended) solta o bind uma única vez', async () => {
    const { result } = await montar();

    act(() => { result.current.handlePreview(memesDoBackend[0] as AudioMemeItem); });
    const audio = FakeAudio.instances[0];

    act(() => { audio.terminar(); });

    expect(audio.inscritoNoVolume()).toBe(false);
    expect(previews()).toHaveLength(0);
    expect(result.current.playingId).toBeNull();
  });
});
