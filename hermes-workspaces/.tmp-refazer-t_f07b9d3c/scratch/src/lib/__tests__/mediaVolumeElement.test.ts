import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * E07/E09/E10/E26/E44 — comportamento de baixo nível da aplicação do volume no
 * `HTMLMediaElement` (o que o jsdom permite provar sem navegador): caminho nativo,
 * caminho WebAudio do iOS, reaplicação no `loadedmetadata` e sonda de faixa de áudio.
 */

type StoreModule = typeof import('@/lib/mediaVolumeStore');
type ElementModule = typeof import('@/lib/mediaVolumeElement');

/** Cada teste nasce com singletons limpos (o módulo guarda cache de suporte e de contexto). */
async function fresh(): Promise<{ store: StoreModule; el: ElementModule }> {
  vi.resetModules();
  const store = await import('@/lib/mediaVolumeStore');
  const el = await import('@/lib/mediaVolumeElement');
  return { store, el };
}

const descritorVolumeOriginal = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');

/** iOS/Safari: `volume` é somente-leitura e o sistema manda no volume final. */
function simularIOS() {
  Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
    configurable: true,
    get: () => 1,
    set: () => {
      /* ignorado, como no iOS */
    },
  });
}

const grafo = {
  contextos: 0,
  sources: 0,
  resumidos: 0,
  fechados: 0,
  falharSource: false,
  ganhos: [] as { gain: { value: number } }[],
};

class FakeGainNode {
  gain = { value: 1 };
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  constructor() {
    grafo.contextos += 1;
  }
  createGain() {
    const node = new FakeGainNode();
    grafo.ganhos.push(node);
    return node;
  }
  createMediaElementSource() {
    // Simula a falha de preparação ANTES de o nó existir (o elemento continua sem dono).
    if (grafo.falharSource) throw new Error('grafo indisponível');
    grafo.sources += 1;
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  resume() {
    grafo.resumidos += 1;
    return Promise.resolve();
  }
  close() {
    grafo.fechados += 1;
    return Promise.resolve();
  }
}

describe('mediaVolumeElement — volume no elemento de mídia', () => {
  beforeEach(() => {
    window.localStorage.clear();
    grafo.contextos = 0;
    grafo.sources = 0;
    grafo.resumidos = 0;
    grafo.fechados = 0;
    grafo.falharSource = false;
    grafo.ganhos = [];
  });

  afterEach(() => {
    if (descritorVolumeOriginal) {
      Object.defineProperty(HTMLMediaElement.prototype, 'volume', descritorVolumeOriginal);
    }
    vi.unstubAllGlobals();
  });

  it('E09: com volume gravável (jsdom/desktop) escreve direto em element.volume, sem criar WebAudio', async () => {
    const { el } = await fresh();
    const audio = document.createElement('audio');

    expect(el.detectNativeVolumeSupport()).toBe(true);
    expect(el.isMediaVolumeControllable()).toBe(true);

    el.applyMediaVolume(audio, 0.25, true);

    expect(audio.volume).toBeCloseTo(0.25, 5);
    expect(audio.muted).toBe(true);
    expect(grafo.contextos).toBe(0);
  });

  it('E09/D5: no iOS (volume read-only) e sem AudioContext o controle se declara indisponível em vez de mentir', async () => {
    simularIOS();
    const { el } = await fresh();

    expect(el.detectNativeVolumeSupport()).toBe(false);
    expect(el.isMediaVolumeControllable()).toBe(false);
  });

  it('E10: no iOS o ganho sai por GainNode dedicado da mídia — e só depois do gesto de play', async () => {
    simularIOS();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const { el } = await fresh();
    const audio = document.createElement('audio');

    expect(el.isMediaVolumeControllable()).toBe(true);

    el.applyMediaVolume(audio, 0.25, true);

    // E10 — sem gesto não existe contexto: criado aqui, o navegador o entregaria
    // SUSPENSO e o áudio sairia mudo. O mute, que é do próprio elemento, entra igual.
    expect(grafo.sources).toBe(0);
    expect(grafo.ganhos).toHaveLength(0);
    expect(audio.muted).toBe(true);

    const detach = el.attachMediaVolume(audio);
    audio.dispatchEvent(new Event('play'));

    expect(grafo.sources).toBe(1);
    expect(grafo.ganhos).toHaveLength(1);

    el.applyMediaVolume(audio, 0.25, true);
    expect(grafo.ganhos[0].gain.value).toBeCloseTo(0.25, 5);

    // `createMediaElementSource` só pode ser chamado uma vez por elemento: a segunda
    // aplicação tem de reusar o nó, não criar outro.
    el.applyMediaVolume(audio, 0.5, false);
    expect(grafo.sources).toBe(1);
    expect(grafo.ganhos[0].gain.value).toBeCloseTo(0.5, 5);
    expect(audio.muted).toBe(false);

    detach();
  });

  it('E07/E44: attachMediaVolume aplica agora, acompanha o store e reaplica quando a URL renova', async () => {
    const { store, el } = await fresh();
    const audio = document.createElement('audio');

    const detach = el.attachMediaVolume(audio);

    expect(audio.volume).toBeCloseTo(store.toGain(80), 5); // default 80% → 0.64

    store.setVolume(50);
    expect(audio.volume).toBeCloseTo(0.25, 5);

    store.setMuted(true);
    expect(audio.muted).toBe(true);

    // URL assinada renova → o elemento recarrega e o volume nativo volta a 1.
    audio.volume = 1;
    audio.dispatchEvent(new Event('loadedmetadata'));
    expect(audio.volume).toBeCloseTo(0.25, 5);

    detach();
    store.setVolume(100);
    expect(audio.volume).toBeCloseTo(0.25, 5);
  });

  it('E44: elemento recriado (novo <video> no lugar do antigo) recebe o volume no primeiro commit', async () => {
    const { store, el } = await fresh();
    store.setVolume(40);

    const antigo = document.createElement('video');
    const detachAntigo = el.attachMediaVolume(antigo);
    expect(antigo.volume).toBeCloseTo(0.16, 5);
    detachAntigo();

    const novo = document.createElement('video');
    el.attachMediaVolume(novo);
    expect(novo.volume).toBeCloseTo(0.16, 5);
  });

  it('E26: a sonda de faixa de áudio responde só com prova — indeterminado vira "tem áudio"', async () => {
    const { el } = await fresh();
    const video = document.createElement('video') as HTMLVideoElement & {
      mozHasAudio?: boolean;
      webkitAudioDecodedByteCount?: number;
    };

    // jsdom expõe uma lista de faixas vazia, mas sem metadados ela não é prova de nada.
    expect(el.detectVideoAudioTrack(video)).toBeNull();

    // Firefox responde pelos metadados.
    Object.defineProperty(video, 'mozHasAudio', { configurable: true, value: false });
    expect(el.detectVideoAudioTrack(video)).toBe(false);

    // Chromium só é prova depois de decodificar.
    const chromium = document.createElement('video') as HTMLVideoElement & {
      webkitAudioDecodedByteCount?: number;
    };
    Object.defineProperty(chromium, 'webkitAudioDecodedByteCount', { configurable: true, value: 0 });
    expect(el.detectVideoAudioTrack(chromium)).toBeNull();

    Object.defineProperty(chromium, 'readyState', { configurable: true, get: () => 4 });
    Object.defineProperty(chromium, 'currentTime', { configurable: true, get: () => 3 });
    expect(el.detectVideoAudioTrack(chromium)).toBe(false);

    // WebKit: a lista só vale a partir dos metadados.
    const webkit = document.createElement('video');
    Object.defineProperty(webkit, 'audioTracks', { configurable: true, value: { length: 0 } });
    expect(el.detectVideoAudioTrack(webkit)).toBeNull();

    Object.defineProperty(webkit, 'readyState', { configurable: true, get: () => 1 });
    expect(el.detectVideoAudioTrack(webkit)).toBe(false);

    Object.defineProperty(webkit, 'audioTracks', { configurable: true, value: { length: 1 } });
    expect(el.detectVideoAudioTrack(webkit)).toBe(true);
  });

  it('VOL-01: no caminho de volume nativo o play não instancia AudioContext nenhum', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const { el } = await fresh();
    const audio = document.createElement('audio');

    expect(el.detectNativeVolumeSupport()).toBe(true);

    const detach = el.attachMediaVolume(audio);
    audio.dispatchEvent(new Event('play'));

    // O gesto realmente aplicou o volume (caminho nativo seguiu vivo)…
    expect(audio.volume).toBeCloseTo(0.64, 5);

    detach();

    // …e nada de WebAudio: o singleton não pode nascer para quem não vai usá-lo.
    expect(grafo.contextos).toBe(0);
    expect(grafo.sources).toBe(0);
    expect(grafo.fechados).toBe(0);
  });

  it('VOL-01: no fallback dois elementos compartilham o contexto — e ele fecha exatamente uma vez, ao soltar o último', async () => {
    simularIOS();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const { el } = await fresh();

    const um = document.createElement('audio');
    const dois = document.createElement('audio');
    const soltarUm = el.attachMediaVolume(um);
    const soltarDois = el.attachMediaVolume(dois);

    um.dispatchEvent(new Event('play'));
    dois.dispatchEvent(new Event('play'));

    expect(grafo.contextos).toBe(1);
    expect(grafo.sources).toBe(2);
    expect(grafo.fechados).toBe(0);

    soltarUm();
    // O segundo continua na tela: fechar aqui emudeceria quem ainda está tocando.
    expect(grafo.fechados).toBe(0);

    soltarDois();
    expect(grafo.fechados).toBe(1);
  });

  it('VOL-01: falha antes de registrar o GainNode não retém contexto sem dono e a próxima tentativa cria contexto novo', async () => {
    simularIOS();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const { el } = await fresh();

    grafo.falharSource = true;
    const quebrado = document.createElement('audio');
    const soltarQuebrado = el.attachMediaVolume(quebrado);
    quebrado.dispatchEvent(new Event('play'));

    expect(grafo.contextos).toBe(1);
    expect(grafo.sources).toBe(0);
    // O contexto nasceu para este elemento e ficou sem consumidor: tem de ser fechado.
    expect(grafo.fechados).toBe(1);

    grafo.falharSource = false;
    const sadio = document.createElement('audio');
    const soltarSadio = el.attachMediaVolume(sadio);
    sadio.dispatchEvent(new Event('play'));

    expect(grafo.contextos).toBe(2);
    expect(grafo.sources).toBe(1);

    soltarQuebrado();
    soltarSadio();
    expect(grafo.fechados).toBe(2);
  });

  it('VOL-01: no fallback, soltar um elemento que nunca registrou GainNode também não deixa o contexto retido', async () => {
    simularIOS();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const { el } = await fresh();

    const audio = document.createElement('audio');
    // `apply` que não passa pelo caminho de ganho: o contexto nasce no gesto e fica sem dono.
    const detach = el.bindMediaVolume(audio, () => {});
    audio.dispatchEvent(new Event('play'));

    expect(grafo.contextos).toBe(1);
    expect(grafo.sources).toBe(0);
    expect(grafo.fechados).toBe(0);

    detach();
    expect(grafo.fechados).toBe(1);

    // O singleton reiniciou: o próximo consumidor cria um contexto novo.
    const outro = document.createElement('audio');
    const soltarOutro = el.attachMediaVolume(outro);
    outro.dispatchEvent(new Event('play'));

    expect(grafo.contextos).toBe(2);
    expect(grafo.sources).toBe(1);

    soltarOutro();
    expect(grafo.fechados).toBe(2);
  });
});
