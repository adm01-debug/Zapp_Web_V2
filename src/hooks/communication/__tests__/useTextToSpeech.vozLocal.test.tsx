/**
 * HZ3-004 — "ouvir mensagem" não pode mandar o texto do cliente para fora do sistema.
 *
 * Aqui se prova o contrato novo do hook:
 *   1. voz do dispositivo (padrão do app) lê no navegador SEM tocar a rede;
 *   2. voz premium escolhida nas preferências chama a Edge `elevenlabs-tts` (e só então);
 *   3. 429/5xx da Edge cai para a voz do dispositivo em vez de só mostrar toast;
 *   4. o teto de texto do servidor (5000) vale também no cliente;
 *   5. a fala local é cancelada ao desmontar e recomeça do trecho não lido na troca de
 *      velocidade (a Web Speech não aceita mudar a taxa durante a fala).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

// URL não-Supabase de propósito: a guarda de rede da suíte recusa host supabase.co.
vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://tts.local.test',
}));

vi.mock('@/lib/edgeAuthHeaders', () => ({
  edgeAuthHeaders: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/mediaVolumeElement', () => ({
  attachMediaVolume: vi.fn(() => vi.fn()),
}));

import { toast } from 'sonner';
import {
  useTextToSpeech,
  LOCAL_VOICE_ID,
  MAX_TTS_TEXT_LENGTH,
} from '@/hooks/communication/useTextToSpeech';

// ── sintetizador falso: registra as falas locais ───────────────────────────────
interface FakeUtterance {
  text: string;
  rate: number;
  voice: unknown;
  onstart: (() => void) | null;
  onboundary: ((evento: { charIndex: number }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

let falas: FakeUtterance[] = [];
let synth: { speak: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; getVoices: ReturnType<typeof vi.fn> };

function installSpeechStub() {
  falas = [];
  synth = {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => []),
  };
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class implements FakeUtterance {
      text: string;
      rate = 1;
      voice: unknown = null;
      onstart: (() => void) | null = null;
      onboundary: ((evento: { charIndex: number }) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
        falas.push(this);
      }
    },
  );
  Object.defineProperty(window, 'speechSynthesis', {
    value: synth,
    configurable: true,
    writable: true,
  });
}

/** Resposta de sucesso da Edge (corpo em texto: o Blob do CI não tem `stream()`). */
function respostaDeAudio() {
  return new Response('audio-falso', { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
}

function installFetchStub(response: Response = respostaDeAudio()) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response)));
  vi.stubGlobal(
    'Audio',
    class {
      src: string;
      playbackRate = 1;
      currentTime = 0;
      onplay: (() => void) | null = null;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      play = vi.fn().mockResolvedValue(undefined);
      pause = vi.fn();
      constructor(src: string) {
        this.src = src;
      }
    },
  );
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:tts-fake'), configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
}

async function falar(
  result: { current: ReturnType<typeof useTextToSpeech> },
  texto: string,
  messageId?: string,
) {
  await act(async () => {
    await result.current.speak(texto, messageId);
  });
}

describe('useTextToSpeech — voz local (HZ3-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpeechStub();
    installFetchStub();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('padrão: a voz do dispositivo lê no navegador e não toca a rede', async () => {
    const { result } = renderHook(() => useTextToSpeech({ initialVoiceId: LOCAL_VOICE_ID }));

    await falar(result, 'mensagem da conversa', 'm-1');

    expect(fetch).not.toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(falas).toHaveLength(1);
    expect(falas[0].text).toBe('mensagem da conversa');
    expect(falas[0].rate).toBe(1);
    expect(result.current.currentMessageId).toBe('m-1');

    act(() => {
      falas[0].onstart?.();
    });
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.isLoading).toBe(false);

    act(() => {
      falas[0].onend?.();
    });
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentMessageId).toBeNull();
  });

  it('sincroniza as preferências que chegam depois do mount', async () => {
    const { result, rerender } = renderHook(
      ({ voz, velocidade }: { voz: string; velocidade: number }) =>
        useTextToSpeech({ initialVoiceId: voz, initialSpeed: velocidade }),
      { initialProps: { voz: 'EXAVITQu4vr4xnSDxMaL', velocidade: 1 } },
    );

    // a preferência (voz local + 1,5x) só chega depois do mount
    rerender({ voz: LOCAL_VOICE_ID, velocidade: 1.5 });
    await falar(result, 'mensagem da conversa');

    expect(fetch).not.toHaveBeenCalled();
    expect(falas[0].rate).toBe(1.5);
  });

  it('limpa o texto antes de falar: [Imagem] sai e URL vira "link"', async () => {
    const { result } = renderHook(() => useTextToSpeech({ initialVoiceId: LOCAL_VOICE_ID }));

    await falar(result, '[Imagem] veja https://exemplo.test/a agora');

    expect(falas[0].text).toBe('veja link agora');
  });

  it('voz premium escolhida nas preferências chama a Edge', async () => {
    const { result } = renderHook(() =>
      useTextToSpeech({ initialVoiceId: 'EXAVITQu4vr4xnSDxMaL' }),
    );

    await falar(result, 'mensagem da conversa', 'm-2');

    expect(synth.speak).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://tts.local.test/functions/v1/elevenlabs-tts');
    expect(JSON.parse(String(init.body))).toEqual({
      text: 'mensagem da conversa',
      voiceId: 'EXAVITQu4vr4xnSDxMaL',
    });
  });

  it('429 da Edge cai para a voz do dispositivo com aviso discreto', async () => {
    installFetchStub(
      new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { result } = renderHook(() =>
      useTextToSpeech({ initialVoiceId: 'EXAVITQu4vr4xnSDxMaL' }),
    );

    await falar(result, 'mensagem da conversa', 'm-3');

    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(falas[0].text).toBe('mensagem da conversa');
    expect(toast.info).toHaveBeenCalledWith('Voz premium indisponível: usando a voz do dispositivo');

    act(() => {
      falas[0].onstart?.();
    });
    expect(result.current.isPlaying).toBe(true);
    // a queda local assumiu a geração: o `finally` do pedido premium não apaga o loading da fala
    expect(result.current.isLoading).toBe(false);
    expect(result.current.currentMessageId).toBe('m-3');
  });

  it('chave ausente (500) também cai para a voz do dispositivo', async () => {
    installFetchStub(new Response('Internal server error', { status: 500 }));
    const { result } = renderHook(() =>
      useTextToSpeech({ initialVoiceId: 'EXAVITQu4vr4xnSDxMaL' }),
    );

    await falar(result, 'mensagem da conversa');

    expect(falas).toHaveLength(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('erro do provedor que não é 429/5xx continua sendo erro (não inventa fala)', async () => {
    installFetchStub(
      new Response(JSON.stringify({ error: 'Voz não permitida' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { result } = renderHook(() =>
      useTextToSpeech({ initialVoiceId: 'EXAVITQu4vr4xnSDxMaL' }),
    );

    await falar(result, 'mensagem da conversa');

    expect(synth.speak).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Voz não permitida');
  });

  it('teto do servidor aplicado no cliente: pedido premium leva no máximo 5000 caracteres', async () => {
    const textoLongo = 'a'.repeat(MAX_TTS_TEXT_LENGTH + 120);
    const { result } = renderHook(() =>
      useTextToSpeech({ initialVoiceId: 'EXAVITQu4vr4xnSDxMaL' }),
    );

    await falar(result, textoLongo);

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect((JSON.parse(String(init.body)) as { text: string }).text).toHaveLength(MAX_TTS_TEXT_LENGTH);
    expect(toast.info).toHaveBeenCalledWith('Mensagem longa: a voz premium lê os primeiros 5000 caracteres');
  });

  it('desmontar cancela a fala local', async () => {
    const { result, unmount } = renderHook(() => useTextToSpeech({ initialVoiceId: LOCAL_VOICE_ID }));
    await falar(result, 'mensagem da conversa');

    unmount();

    expect(synth.cancel).toHaveBeenCalled();
  });

  it('stop() cancela a fala local e libera o estado', async () => {
    const { result } = renderHook(() => useTextToSpeech({ initialVoiceId: LOCAL_VOICE_ID }));
    await falar(result, 'mensagem da conversa', 'm-4');

    act(() => {
      result.current.stop();
    });

    expect(synth.cancel).toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentMessageId).toBeNull();
  });

  it('troca de velocidade ao vivo recomeça do trecho não lido, na velocidade nova', async () => {
    const { result } = renderHook(() => useTextToSpeech({ initialVoiceId: LOCAL_VOICE_ID }));
    await falar(result, 'mensagem longa para ler devagar');

    act(() => {
      falas[0].onboundary?.({ charIndex: 9 });
    });
    act(() => {
      result.current.setSpeed(1.5);
    });

    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(falas).toHaveLength(2);
    expect(falas[1].text).toBe('longa para ler devagar');
    expect(falas[1].rate).toBe(1.5);
  });

  it('voz do dispositivo por URI/nome usa a voz escolhida no sintetizador', async () => {
    const vozBrasileira = { voiceURI: 'Google português do Brasil', name: 'Google PT', lang: 'pt-BR' };
    synth.getVoices.mockReturnValue([vozBrasileira]);
    const { result } = renderHook(() =>
      useTextToSpeech({ initialVoiceId: `local:${vozBrasileira.voiceURI}` }),
    );

    await falar(result, 'mensagem da conversa');

    expect(falas[0].voice).toBe(vozBrasileira);
  });
});
