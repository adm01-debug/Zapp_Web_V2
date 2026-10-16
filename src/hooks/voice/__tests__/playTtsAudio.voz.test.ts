import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/edgeAuthHeaders', () => ({
  edgeAuthHeaders: () => Promise.resolve({ apikey: 'anon', Authorization: 'Bearer token' }),
}));

vi.mock('@/lib/mediaVolumeElement', () => ({
  attachMediaVolume: () => () => {},
}));

import { playTtsAudio } from '@/hooks/voice/playTtsAudio';

/**
 * 'Ouvir resumo' e 'Ouvir tudo' mandavam só `{ text }` para a edge: o áudio saía na
 * voz padrão do provedor, ignorando a voz do seletor do cabeçalho, e tocava sempre a
 * 1x. Aqui a função REAL roda com o elemento de áudio e a rede falsos e prova os dois
 * canais: o corpo do pedido (voz) e o `playbackRate` do elemento (velocidade), além da
 * queda para a fala do navegador.
 */
class FakeAudio {
  static instances: FakeAudio[] = [];

  preload = '';
  volume = 1;
  muted = false;
  playedRates: number[] = [];
  currentTime = 0;
  _src = '';
  defaultPlaybackRate = 1;
  /** O navegador real restaura o `playbackRate` ao padrão quando um novo `src`
   * assume a seleção de recurso — o falso imita isso para a prova valer. */
  set src(valor: string) {
    this._src = valor;
    this.playbackRate = this.defaultPlaybackRate;
  }
  get src(): string {
    return this._src;
  }
  paused = true;
  playbackRate = 1;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;

  play = vi.fn(() => {
    this.paused = false;
    // Guarda a velocidade vigente no instante de cada `play()`: é ela que o
    // atendente ouve naquele trecho.
    this.playedRates.push(this.playbackRate);
    return Promise.resolve();
  });
  pause = vi.fn(() => {
    this.paused = true;
  });
  load = vi.fn(() => {
    // O navegador real também restaura o `playbackRate` ao padrão no `load()`.
    this.playbackRate = this.defaultPlaybackRate;
  });
  removeAttribute = vi.fn();

  constructor() {
    FakeAudio.instances.push(this);
  }
}

class FakeUtterance {
  static criadas: FakeUtterance[] = [];

  text: string;
  lang = '';
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(text: string) {
    this.text = text;
    FakeUtterance.criadas.push(this);
  }
}

const SUPABASE_URL = 'https://projeto-de-teste.supabase.co';
const ANON_KEY = 'anon-key-de-teste';
const VOZ_ESCOLHIDA = 'CwhRBWXzGAHq8TQ4Fs17';

let fetchMock: ReturnType<typeof vi.fn>;
let speakMock: ReturnType<typeof vi.fn>;

const respostaDeAudio = () => ({
  ok: true,
  status: 200,
  blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/mpeg' })),
  text: () => Promise.resolve(''),
});

const respostaSemPermissao = () => ({
  ok: false,
  status: 401,
  blob: () => Promise.resolve(new Blob([''], { type: 'audio/mpeg' })),
  text: () => Promise.resolve('unauthorized'),
});

/** Corpo do primeiro pedido de áudio feito à edge. */
function corpoDoPedido(): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as { body?: string } | undefined;
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

describe('playTtsAudio — voz e velocidade escolhidas', () => {
  beforeEach(() => {
    FakeAudio.instances = [];
    FakeUtterance.criadas = [];
    vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio);
    fetchMock = vi.fn(() => Promise.resolve(respostaDeAudio()));
    vi.stubGlobal('fetch', fetchMock);
    speakMock = vi.fn();
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: speakMock });
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance as unknown as typeof SpeechSynthesisUtterance);
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:teste/voz'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('manda a voz escolhida no corpo do pedido de áudio', async () => {
    const playback = playTtsAudio('Bom dia.', SUPABASE_URL, ANON_KEY, { voiceId: VOZ_ESCOLHIDA });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(corpoDoPedido()).toEqual({ text: 'Bom dia.', voiceId: VOZ_ESCOLHIDA });

    playback.stop();
  });

  it('sem voz escolhida, o pedido segue sem voiceId (padrão da edge)', async () => {
    const playback = playTtsAudio('Bom dia.', SUPABASE_URL, ANON_KEY);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(corpoDoPedido()).toEqual({ text: 'Bom dia.' });

    playback.stop();
  });

  it('aplica a velocidade escolhida no playbackRate do elemento', async () => {
    const playback = playTtsAudio('Bom dia.', SUPABASE_URL, ANON_KEY, { speed: 1.5 });
    await vi.waitFor(() => expect(FakeAudio.instances[0]?.play).toHaveBeenCalled());

    expect(FakeAudio.instances[0].playbackRate).toBe(1.5);

    playback.stop();
  });

  it('limita a velocidade à faixa do seletor (0,5 a 2,0)', async () => {
    const rapido = playTtsAudio('Bom dia.', SUPABASE_URL, ANON_KEY, { speed: 3 });
    await vi.waitFor(() => expect(FakeAudio.instances[0]?.play).toHaveBeenCalled());
    expect(FakeAudio.instances[0].playbackRate).toBe(2);
    rapido.stop();

    FakeAudio.instances = [];
    const lento = playTtsAudio('Bom dia.', SUPABASE_URL, ANON_KEY, { speed: 0.1 });
    await vi.waitFor(() => expect(FakeAudio.instances[0]?.play).toHaveBeenCalled());
    expect(FakeAudio.instances[0].playbackRate).toBe(0.5);
    lento.stop();
  });

  it('mantém a velocidade escolhida do primeiro ao último trecho (sem voltar a 1x)', async () => {
    // Resumo longo: dois trechos de áudio. O navegador restaura o playbackRate a
    // cada `src` novo — a velocidade 1.5x tem de valer no trecho 2 também.
    const textoLongo =
      'O cliente pediu um orçamento de brindes personalizados para a festa de confraternização de fim de ano da empresa com entrega urgente. ' +
      'O atendente registrou a conversa completa e enviou a proposta com os prazos de produção e as condições de pagamento aprovadas.';
    const playback = playTtsAudio(textoLongo, SUPABASE_URL, ANON_KEY, { speed: 1.5 });
    await vi.waitFor(() => expect(FakeAudio.instances[0]?.play).toHaveBeenCalledTimes(1));
    expect(FakeAudio.instances[0].playbackRate).toBe(1.5);
    expect(FakeAudio.instances[0].defaultPlaybackRate).toBe(1.5);

    // O trecho 1 termina como no navegador: o player assume o trecho seguinte.
    FakeAudio.instances[0].onended?.();
    await vi.waitFor(() => expect(FakeAudio.instances[0]?.play).toHaveBeenCalledTimes(2));
    // A velocidade que o atendente ouve em cada `play()`: 1.5x nos dois trechos.
    expect(FakeAudio.instances[0].playedRates).toEqual([1.5, 1.5]);
    expect(FakeAudio.instances[0].playbackRate).toBe(1.5);

    playback.stop();
  });

  it('na queda para a fala do navegador, a velocidade também vale (rate)', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(respostaSemPermissao()));

    const playback = playTtsAudio('Bom dia.', SUPABASE_URL, ANON_KEY, { speed: 1.5 });
    await vi.waitFor(() => expect(speakMock).toHaveBeenCalled());

    expect(FakeUtterance.criadas[0].rate).toBe(1.5);

    playback.stop();
  });
});
