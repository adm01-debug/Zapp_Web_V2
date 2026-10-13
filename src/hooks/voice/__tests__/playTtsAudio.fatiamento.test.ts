/**
 * playTtsAudio — fatiamento do texto, pré-busca do próximo pedaço, fallback e autoplay.
 *
 * `splitTextIntoTtsChunks` (e o `splitLongTtsSegment` interno) não são exportados: o teste
 * prova o fatiamento pelo comportamento OBSERVÁVEL da função real — o corpo de cada POST
 * para `elevenlabs-tts-stream` é exatamente o texto de cada pedaço, na ordem de reprodução.
 *
 * A função REAL roda; só a rede (fetch), o elemento de áudio e a fala do navegador são
 * substituídos. Cobre também a pré-busca (o próximo pedaço é pedido antes de o atual
 * terminar), a ordem de reprodução, o fallback para `speechSynthesis` e o autoplay bloqueado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/edgeAuthHeaders', () => ({
  edgeAuthHeaders: () => Promise.resolve({ apikey: 'k', Authorization: 'Bearer token' }),
}));

vi.mock('@/lib/mediaVolumeElement', () => ({
  attachMediaVolume: () => () => {},
}));

import { playTtsAudio } from '@/hooks/voice/playTtsAudio';

class FakeAudio {
  static instances: FakeAudio[] = [];
  static rejeitarPlayCom: Error | null = null;

  preload = '';
  volume = 1;
  muted = false;
  currentTime = 0;
  src = '';
  paused = true;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;

  play = vi.fn(() => {
    if (FakeAudio.rejeitarPlayCom) return Promise.reject(FakeAudio.rejeitarPlayCom);
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

  emitEnded() {
    this.paused = true;
    this.onended?.();
  }
}

const SUPABASE_URL = 'https://projeto-de-teste.supabase.co';
const ANON_KEY = 'anon-key-de-teste';

let objectUrlSeq = 0;
let fetchMock: ReturnType<typeof vi.fn>;

const respostaOk = () => ({
  ok: true,
  status: 200,
  blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/mpeg' })),
  text: () => Promise.resolve(''),
});

/** Textos efetivamente enviados à edge, na ordem das chamadas. */
const textosEnviados = () =>
  fetchMock.mock.calls.map((call) => JSON.parse(String(call[1].body)).text as string);

async function aguardarReproducao() {
  await vi.waitFor(() => {
    expect(FakeAudio.instances[0]?.play).toHaveBeenCalled();
  });
}

beforeEach(() => {
  FakeAudio.instances = [];
  FakeAudio.rejeitarPlayCom = null;
  objectUrlSeq = 0;
  vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio);
  fetchMock = vi.fn(() => Promise.resolve(respostaOk()));
  vi.stubGlobal('fetch', fetchMock);
  Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:teste/${++objectUrlSeq}`),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('playTtsAudio — fatiamento do texto (splitTextIntoTtsChunks)', () => {
  it('frase curta vira um único pedido com o texto normalizado', async () => {
    const playback = playTtsAudio('  Bom   dia.  ', SUPABASE_URL, ANON_KEY);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(textosEnviados()).toEqual(['Bom dia.']);

    FakeAudio.instances[0].emitEnded();
    await expect(playback.promise).resolves.toBeUndefined();
  });

  it('texto vazio não pede áudio nem sinaliza carregamento', async () => {
    const onLoadingChange = vi.fn();
    const playback = playTtsAudio('   ', SUPABASE_URL, ANON_KEY, { onLoadingChange });

    await expect(playback.promise).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    // Sem texto não há reprodução: o carregamento nunca é ligado (o `finally` só o desliga).
    expect(onLoadingChange).not.toHaveBeenCalledWith(true);
  });

  it('palavra sem separador é cortada no teto de 220 caracteres', async () => {
    const palavra = 'a'.repeat(230);
    playTtsAudio(palavra, SUPABASE_URL, ANON_KEY);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(textosEnviados()).toEqual(['a'.repeat(220), 'a'.repeat(10)]);
  });

  it('frase longa é separada na pontuação (vírgula) mantendo cada pedaço inteiro', async () => {
    const parteA = 'a'.repeat(200);
    const parteB = 'b'.repeat(200);
    playTtsAudio(`${parteA}, ${parteB}.`, SUPABASE_URL, ANON_KEY);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(textosEnviados()).toEqual([`${parteA},`, `${parteB}.`]);
  });
});

describe('playTtsAudio — pré-busca e ordem de reprodução dos pedaços', () => {
  it('pede o segundo pedaço antes de o primeiro terminar e toca os dois na ordem', async () => {
    const parteA = 'a'.repeat(200);
    const parteB = 'b'.repeat(200);
    const playback = playTtsAudio(`${parteA}, ${parteB}.`, SUPABASE_URL, ANON_KEY);

    await aguardarReproducao();
    const audio = FakeAudio.instances[0];
    const primeiroSrc = audio.src;

    // Pré-busca: os DOIS pedidos já saíram enquanto o primeiro ainda toca.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(audio.play).toHaveBeenCalledTimes(1);

    audio.emitEnded();
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalledTimes(2));
    expect(audio.src).not.toBe(primeiroSrc);

    audio.emitEnded();
    await expect(playback.promise).resolves.toBeUndefined();
  });
});

describe('playTtsAudio — fallback para a fala do navegador', () => {
  class FakeUtterance {
    lang = '';
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public text: string) {}
  }

  it('erro do servidor de TTS reporta o erro e fala o texto restante no navegador', async () => {
    const utterances: FakeUtterance[] = [];
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance as unknown as typeof SpeechSynthesisUtterance);
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak: vi.fn((u: FakeUtterance) => {
        utterances.push(u);
        u.onend?.();
      }),
    });

    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      blob: () => Promise.resolve(new Blob()),
      text: () => Promise.resolve('boom'),
    });

    const onError = vi.fn();
    const playback = playTtsAudio('Bom dia.', SUPABASE_URL, ANON_KEY, { onError });

    await expect(playback.promise).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(utterances).toHaveLength(1);
    expect(utterances[0].text).toBe('Bom dia.');
    expect(utterances[0].lang).toBe('pt-BR');
  });

  it('chave de TTS inválida (403) também cai para a fala do navegador', async () => {
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance as unknown as typeof SpeechSynthesisUtterance);
    const speak = vi.fn((u: FakeUtterance) => u.onend?.());
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak });

    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      blob: () => Promise.resolve(new Blob()),
      text: () => Promise.resolve('forbidden'),
    });

    const onError = vi.fn();
    const playback = playTtsAudio('Bom dia.', SUPABASE_URL, ANON_KEY, { onError });

    await expect(playback.promise).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0][0].message)).toContain('TTS_UNAUTHORIZED');
    expect(speak).toHaveBeenCalledTimes(1);
  });
});

describe('playTtsAudio — autoplay bloqueado', () => {
  it('avisa o bloqueio e NÃO tenta falar no navegador', async () => {
    const erroDeAutoplay = Object.assign(new Error('play blocked'), { name: 'NotAllowedError' });
    FakeAudio.rejeitarPlayCom = erroDeAutoplay;

    const speak = vi.fn();
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak });

    const onAutoplayBlocked = vi.fn();
    const onError = vi.fn();
    const playback = playTtsAudio('Bom dia.', SUPABASE_URL, ANON_KEY, { onAutoplayBlocked, onError });

    await expect(playback.promise).resolves.toBeUndefined();
    // O aviso de bloqueio é idempotente para os consumidores atuais (setState(true)):
    // o caminho emite o callback mais de uma vez (no `playObjectUrl` e no catch do laço).
    expect(onAutoplayBlocked).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe('AUTOPLAY_BLOCKED');
    expect(speak).not.toHaveBeenCalled();
  });
});
