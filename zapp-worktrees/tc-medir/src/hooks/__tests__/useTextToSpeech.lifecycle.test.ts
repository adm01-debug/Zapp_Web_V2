/**
 * R2-INB-040 (#334) — "TTS do chat continua após desmontagem e aceita duas
 * gerações simultâneas da mesma mensagem".
 *
 * Aqui se prova o contrato do HOOK (a parte do botão é provada em
 * `src/components/inbox/__tests__/TextToSpeechButton.cancel.test.tsx`):
 *   1. desmontar invalida o pedido em voo — a resposta atrasada não cria nem toca `Audio`;
 *   2. `stop()` aborta o fetch vigente e libera loading/currentMessageId;
 *   3. dois pedidos seguidos da mesma mensagem resultam em UMA fala (a vigente);
 *   4. desmontar libera o `Audio` e a object URL da geração vigente.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// URL não-Supabase de propósito: a guarda de rede da suíte recusa host supabase.co.
vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://tts.local.test',
}));

vi.mock('@/lib/edgeAuthHeaders', () => ({
  edgeAuthHeaders: vi.fn().mockResolvedValue({}),
}));

const mocks = vi.hoisted(() => ({ attach: vi.fn(), detach: vi.fn() }));
vi.mock('@/lib/mediaVolumeElement', () => ({
  attachMediaVolume: (...args: unknown[]) => mocks.attach(...args),
}));

import { useTextToSpeech } from '@/hooks/communication/useTextToSpeech';

// ── Audio falso: registra as instâncias para provar quem criou/tocou o quê ──────
interface FakeAudioInstance {
  src: string;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  playbackRate: number;
  currentTime: number;
  onplay: (() => void) | null;
  onended: (() => void) | null;
  onerror: (() => void) | null;
}

let audios: FakeAudioInstance[] = [];

function installAudioStub() {
  audios = [];
  vi.stubGlobal(
    'Audio',
    class FakeAudio implements FakeAudioInstance {
      src: string;
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();
      playbackRate = 1;
      currentTime = 0;
      onplay: (() => void) | null = null;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(src: string) {
        this.src = src;
        audios.push(this);
      }
    },
  );
}

// ── fetch controlado: cada pedido fica pendente até o teste resolver ───────────
interface PendingFetch {
  resolve: (response: Response) => void;
  signal?: AbortSignal;
}

let pendingFetches: PendingFetch[] = [];

function installFetchStub() {
  pendingFetches = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (input: unknown, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          pendingFetches.push({
            resolve,
            signal: init?.signal ?? undefined,
          });
        }),
    ),
  );
}

function resolveFetch(index: number) {
  const blob = new Blob(['audio-falso'], { type: 'audio/mpeg' });
  pendingFetches[index].resolve(new Response(blob, { status: 200 }));
}

/** Deixa os `await` internos do hook assentarem. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Dispara `speak` sem esperar a resposta (é ela que fica pendente). */
async function startSpeak(
  result: { current: ReturnType<typeof useTextToSpeech> },
  text: string,
  messageId: string,
) {
  await act(async () => {
    void result.current.speak(text, messageId);
  });
  await flush();
}

describe('useTextToSpeech — ciclo de vida do pedido TTS (R2-INB-040)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.attach.mockReturnValue(mocks.detach);
    installAudioStub();
    installFetchStub();
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:tts-fake'),
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resposta atrasada de painel desmontado não cria nem toca Audio', async () => {
    const { result, unmount } = renderHook(() => useTextToSpeech());
    await startSpeak(result, 'mensagem da conversa', 'm-1');
    expect(pendingFetches).toHaveLength(1);

    unmount();

    // o pedido em voo é invalidado na desmontagem
    expect(pendingFetches[0].signal?.aborted).toBe(true);

    // a resposta que chega depois nao pode criar/tocar nada
    resolveFetch(0);
    await flush();

    expect(audios).toHaveLength(0);
  });

  it('stop() aborta o pedido em voo e libera loading e currentMessageId', async () => {
    const { result } = renderHook(() => useTextToSpeech());
    await startSpeak(result, 'mensagem da conversa', 'm-1');
    expect(result.current.isLoading).toBe(true);
    expect(result.current.currentMessageId).toBe('m-1');

    act(() => {
      result.current.stop();
    });

    expect(pendingFetches[0].signal?.aborted).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.currentMessageId).toBeNull();

    // e a resposta que chega depois do stop() nao toca
    resolveFetch(0);
    await flush();
    expect(audios).toHaveLength(0);
  });

  it('dois pedidos seguidos da mesma mensagem produzem só a fala vigente', async () => {
    const { result } = renderHook(() => useTextToSpeech());

    await startSpeak(result, 'mensagem da conversa', 'm-1');
    await startSpeak(result, 'mensagem da conversa', 'm-1');
    expect(pendingFetches).toHaveLength(2);
    // o segundo pedido invalidou o primeiro
    expect(pendingFetches[0].signal?.aborted).toBe(true);

    // a resposta VIGENTE (a segunda) chega primeiro
    resolveFetch(1);
    await flush();
    expect(audios).toHaveLength(1);
    const vigente = audios[0];
    expect(vigente.play).toHaveBeenCalledTimes(1);

    // a resposta obsoleta (a primeira) chega depois: nao cria nem toca um segundo Audio
    resolveFetch(0);
    await flush();
    expect(audios).toHaveLength(1);
    expect(vigente.play).toHaveBeenCalledTimes(1);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.currentMessageId).toBe('m-1');
  });

  it('desmontar libera o Audio e a object URL da geração vigente', async () => {
    const { result, unmount } = renderHook(() => useTextToSpeech());
    await startSpeak(result, 'mensagem da conversa', 'm-1');
    resolveFetch(0);
    await flush();

    expect(audios).toHaveLength(1);
    const audio = audios[0];

    unmount();

    expect(audio.pause).toHaveBeenCalled();
    expect(mocks.detach).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:tts-fake');
  });
});
