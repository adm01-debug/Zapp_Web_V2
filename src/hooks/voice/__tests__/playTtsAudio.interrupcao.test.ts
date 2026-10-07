import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/edgeAuthHeaders', () => ({
  edgeAuthHeaders: () => Promise.resolve({ apikey: 'anon-key', Authorization: 'Bearer token' }),
}));

vi.mock('@/lib/mediaVolumeElement', () => ({
  attachMediaVolume: () => () => {},
}));

import { playTtsAudio } from '@/hooks/voice/playTtsAudio';

/**
 * #341 (R2-INB-047) — interromper a fala (`stopSpeaking` -> `playback.stop()`) tem de
 * encerrar a Promise que a ação aguarda. Antes da correção, `stop()` chamava `cleanup()`,
 * que desliga `onended`/`onerror` do elemento; o `await playObjectUrl(...)` de dentro do
 * `promise` nunca mais terminava — `await tts.promise` (useVoiceAgent) ficava pendente e a
 * ação seguinte (log + onAction + voltar a 'idle') nunca acontecia.
 *
 * O teste chama a função REAL com o elemento de áudio fake: só a fronteira de rede e o
 * elemento de mídia são substituídos.
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

  /** Simula o fim natural da fala (evento `ended` do elemento). */
  emitEnded() {
    this.paused = true;
    this.onended?.();
  }
}

const SUPABASE_URL = 'https://projeto-de-teste.supabase.co';
const ANON_KEY = 'anon-key-de-teste';
const TIMEOUT_PROVA_MS = 250;

let objectUrlSeq = 0;
let fetchMock: ReturnType<typeof vi.fn>;

const respostaDeAudio = () => ({
  ok: true,
  status: 200,
  blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/mpeg' })),
  text: () => Promise.resolve(''),
});

/** Espera o elemento de áudio entrar em reprodução (fetch + play concluídos). */
async function aguardarReproducao() {
  await vi.waitFor(() => {
    const audio = FakeAudio.instances[0];
    expect(audio).toBeDefined();
    expect(audio.play).toHaveBeenCalled();
  });
}

/**
 * Resolve com 'finalizada' se a Promise terminar; com 'pendente' se ela ainda não
 * tiver terminado dentro do prazo — que é exatamente a falha do #341.
 */
function desfechoDaPromise(promessa: Promise<void>) {
  return Promise.race<'finalizada' | 'pendente'>([
    promessa.then(() => 'finalizada' as const),
    new Promise<'pendente'>((resolve) => {
      setTimeout(() => resolve('pendente'), TIMEOUT_PROVA_MS);
    }),
  ]);
}

describe('playTtsAudio — interromper a fala encerra a Promise da ação (#341)', () => {
  beforeEach(() => {
    FakeAudio.instances = [];
    objectUrlSeq = 0;
    vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio);
    fetchMock = vi.fn(() => Promise.resolve(respostaDeAudio()));
    vi.stubGlobal('fetch', fetchMock);
    Object.assign(URL, {
      createObjectURL: vi.fn(() => `blob:teste/${++objectUrlSeq}`),
      revokeObjectURL: vi.fn(),
    });
  });

  it('ao interromper durante a fala, a Promise que a ação aguarda termina', async () => {
    const playback = playTtsAudio('Bom dia, tudo bem?', SUPABASE_URL, ANON_KEY);
    await aguardarReproducao();

    playback.stop();

    await expect(desfechoDaPromise(playback.promise)).resolves.toBe('finalizada');
  });

  it('ao interromper uma fala de várias frases, a Promise termina e nada mais toca', async () => {
    // Duas frases de ~200 caracteres: viram dois pedaços (> 220 caracteres no total).
    const fraseLonga = (marca: string) => `${marca} ${'palavra '.repeat(25).trim()}`;
    const texto = `${fraseLonga('primeira')}. ${fraseLonga('segunda')}.`;

    const playback = playTtsAudio(texto, SUPABASE_URL, ANON_KEY);
    await aguardarReproducao();
    const audio = FakeAudio.instances[0];

    playback.stop();

    await expect(desfechoDaPromise(playback.promise)).resolves.toBe('finalizada');
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('sem interrupção, o fim natural da fala continua encerrando a Promise', async () => {
    const playback = playTtsAudio('Bom dia.', SUPABASE_URL, ANON_KEY);
    await aguardarReproducao();

    FakeAudio.instances[0].emitEnded();

    await expect(playback.promise).resolves.toBeUndefined();
  });
});
