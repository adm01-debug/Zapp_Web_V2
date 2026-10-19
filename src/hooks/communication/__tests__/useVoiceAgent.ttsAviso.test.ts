import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },

  getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() })) })),
}));

vi.mock('@/lib/edgeAuthHeaders', () => ({
  edgeAuthHeaders: () => Promise.resolve({ apikey: 'apikey-de-teste', Authorization: 'Bearer token' }),
}));

vi.mock('@/lib/mediaVolumeElement', () => ({
  attachMediaVolume: () => () => {},
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'token-de-teste' } } })),
    },
    functions: { invoke: vi.fn() },
  },
  SUPABASE_URL: 'https://projeto-de-teste.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key-de-teste',
}));

const hoisted = vi.hoisted(() => ({
  scribeOptions: null as null | { onCommittedTranscript: (data: { text: string }) => void },
}));

vi.mock('@elevenlabs/react', () => ({
  CommitStrategy: { VAD: 'vad' },
  useScribe: (options: { onCommittedTranscript: (data: { text: string }) => void }) => {
    hoisted.scribeOptions = options;
    return { isConnected: false, connect: vi.fn(), disconnect: vi.fn() };
  },
}));

vi.mock('@/hooks/voice/processTranscript', () => ({
  processVoiceTranscript: vi.fn(),
}));

vi.mock('@/hooks/voice/logVoiceCommand', () => ({
  logVoiceCommand: vi.fn(),
}));

import { processVoiceTranscript } from '@/hooks/voice/processTranscript';
import { useVoiceAgent } from '../useVoiceAgent';

/**
 * O sintoma do cartão: o agente de voz não trata `play()` recusado (Safari/iOS) nem
 * falha do TTS — o operador fica sem som e SEM explicação. Aqui o hook REAL roda com
 * o `playTtsAudio` REAL; só a captura de voz, a rede e o elemento de áudio são falsos.
 */
class FakeAudio {
  static instances: FakeAudio[] = [];
  /** `true` reproduz a política de autoplay do Safari: `play()` recusa. */
  static recusaPlay = false;

  preload = '';
  volume = 1;
  muted = false;
  currentTime = 0;
  src = '';
  paused = true;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;

  play = vi.fn(() => {
    if (FakeAudio.recusaPlay) {
      const erro = new Error('play() failed: NotAllowedError');
      erro.name = 'NotAllowedError';
      return Promise.reject(erro);
    }
    // A fala termina sozinha: sem isso o `await tts.promise` ficaria pendurado.
    queueMicrotask(() => this.onended?.());
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => { this.paused = true; });
  load = vi.fn();
  removeAttribute = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();

  constructor() {
    FakeAudio.instances.push(this);
  }
}

const RESPOSTA = 'Você tem 3 conversas não lidas.';

describe('useVoiceAgent — falha da resposta falada chega na tela (#342)', () => {
  beforeEach(() => {
    FakeAudio.instances = [];
    FakeAudio.recusaPlay = false;
    vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/mpeg' })),
      text: () => Promise.resolve(''),
    })));
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:teste/1'),
      revokeObjectURL: vi.fn(),
    });
    vi.mocked(processVoiceTranscript).mockResolvedValue({
      response: RESPOSTA,
      action: { action: 'answer' },
      data: {},
    } as never);
  });

  async function falar(result: { current: ReturnType<typeof useVoiceAgent> }) {
    await act(async () => {
      hoisted.scribeOptions?.onCommittedTranscript({ text: 'quais conversas não lidas' });
    });
    await waitFor(() => expect(result.current.agentResponse).toBe(RESPOSTA));
  }

  it('play() recusado pelo navegador sinaliza autoplay-blocked (e não o silêncio)', async () => {
    FakeAudio.recusaPlay = true;
    const { result } = renderHook(() => useVoiceAgent({}));

    await falar(result);

    await waitFor(() => expect(result.current.ttsIssue).toBe('autoplay-blocked'));
  });

  it('TTS e fallback do navegador falhando sinaliza playback-failed', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('rede fora'))));
    const { result } = renderHook(() => useVoiceAgent({}));

    await falar(result);

    await waitFor(() => expect(result.current.ttsIssue).toBe('playback-failed'));
  });

  it('replayResponse limpa o aviso e toca a resposta de novo', async () => {
    FakeAudio.recusaPlay = true;
    const { result } = renderHook(() => useVoiceAgent({}));

    await falar(result);
    await waitFor(() => expect(result.current.ttsIssue).toBe('autoplay-blocked'));

    // O toque no aviso é um gesto do usuário: o navegador passa a liberar o áudio.
    FakeAudio.recusaPlay = false;
    await act(async () => {
      await result.current.replayResponse();
    });

    expect(result.current.ttsIssue).toBe('');
    expect(FakeAudio.instances.some((audio) => audio.play.mock.calls.length > 0)).toBe(true);
  });

  it('resposta sem falha nenhuma não liga aviso', async () => {
    const { result } = renderHook(() => useVoiceAgent({}));

    await falar(result);

    expect(result.current.ttsIssue).toBe('');
  });
});
