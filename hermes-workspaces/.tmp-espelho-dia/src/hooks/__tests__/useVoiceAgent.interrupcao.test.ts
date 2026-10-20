import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/edgeAuthHeaders', () => ({
  edgeAuthHeaders: () => Promise.resolve({ apikey: 'anon-key', Authorization: 'Bearer token' }),
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
import { useVoiceAgent } from '@/hooks/communication/useVoiceAgent';

/**
 * #341 (R2-INB-047) — o sintoma que o cartão descreve: interromper a fala do assistente
 * (`stopSpeaking`) deixava a ação pendurada em `await tts.promise`, então o que vem depois
 * da fala (registro do comando + `onAction` + voltar a 'idle') nunca acontecia.
 *
 * Aqui o hook REAL roda com o `playTtsAudio` REAL; só a captura de voz, a rede e o elemento
 * de áudio são substituídos.
 */
class FakeAudio {
  static instances: FakeAudio[] = [];

  preload = '';
  volume = 1;
  muted = false;
  currentTime = 0;
  src = '';
  paused = true;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;

  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  load = vi.fn();
  removeAttribute = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();

  constructor() {
    FakeAudio.instances.push(this);
  }
}

let objectUrlSeq = 0;

describe('useVoiceAgent — interromper a fala não deixa a ação pendurada (#341)', () => {
  beforeEach(() => {
    FakeAudio.instances = [];
    objectUrlSeq = 0;
    vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/mpeg' })),
      text: () => Promise.resolve(''),
    })));
    Object.assign(URL, {
      createObjectURL: vi.fn(() => `blob:teste/${++objectUrlSeq}`),
      revokeObjectURL: vi.fn(),
    });
    vi.mocked(processVoiceTranscript).mockResolvedValue({
      response: 'Feito, chefe.',
      action: { action: 'answer' },
      data: {},
    } as never);
  });

  it('depois de stopSpeaking, a ação segue (onAction + volta a idle)', async () => {
    const onAction = vi.fn();
    const { result } = renderHook(() => useVoiceAgent({ onAction }));

    await act(async () => {
      hoisted.scribeOptions?.onCommittedTranscript({ text: 'faz o que eu pedi' });
    });

    await waitFor(() => expect(result.current.phase).toBe('speaking'));
    await waitFor(() => expect(FakeAudio.instances[0]?.play).toHaveBeenCalled());

    // O atendente interrompe a fala do assistente.
    act(() => {
      result.current.stopSpeaking();
    });

    await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ response: 'Feito, chefe.' }));
    expect(result.current.phase).not.toBe('speaking');
  });
});
