import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Mocks comuns aos testes de controle de volume (toast/logger/framer-motion/ResizeObserver).
import '@/test/volumeControlMocks';

// ─── Mocks (mesmo conjunto do teste de velocidade do player) ──────────────
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: 'https://test.com/audio.webm' } })),
      })),
    },
    functions: { invoke: vi.fn(() => Promise.resolve({ data: { transcription: 'test' }, error: null })) },
    from: vi.fn(() => ({ update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })) })),
  },
}));

const { updateSettingsSpy, settingsDeNotificacao } = vi.hoisted(() => ({
  updateSettingsSpy: vi.fn(),
  // E39 — o ganho do alerta tem de derivar DESTE valor, não de um literal no teste.
  settingsDeNotificacao: { soundEnabled: true, soundVolume: 70 },
}));

// E38 — o controle de mídia não pode encostar nas configurações de notificação.
vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: settingsDeNotificacao,
    updateSettings: updateSettingsSpy,
    isSaving: false,
  }),
}));

import { MediaVolumeControl } from '../MediaVolumeControl';
import { MEDIA_VOLUME_LABEL, MEDIA_VOLUME_LABEL_MUTED, MEDIA_VOLUME_SLIDER_LABEL } from '@/lib/volumeLabels';
import { AudioMessagePlayer } from '../AudioMessagePlayer';
import { useMediaElementVolume } from '@/hooks/communication/useMediaElementVolume';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  DEFAULT_MEDIA_VOLUME_STATE,
  getSnapshot,
  setMuted,
  setVolume,
  toGain,
} from '@/lib/mediaVolumeStore';
import { playNotificationSound } from '@/utils/notificationSounds';
import { SOUND_CONFIGS } from '@/utils/soundConfigs';

// ─── Grafo WebAudio falso: jsdom não tem WebAudio, e é justamente aqui que se
// ─── prova que o caminho da mídia não encosta no caminho dos alertas (E38–E40).
const grafo = {
  osciladores: 0,
  ganhos: 0,
  rampas: [] as number[],
  /** E39 — destinos para onde algum nó fez `connect` (o gargalo da cadeia WebAudio). */
  conexoes: [] as unknown[],
  /** E10 — quantos `AudioContext.close()` foram chamados. */
  contexteFechados: 0,
  /** E39 — o `destination` de cada contexto criado, para saber a QUAL deles o nó foi ligado. */
  destinos: [] as object[],
};

class FakeGainNode {
  gain = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn((valor: number) => {
      grafo.rampas.push(valor);
    }),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn((destino?: unknown) => {
    grafo.conexoes.push(destino);
  });
  disconnect = vi.fn();
}

class FakeOscillatorNode {
  type = 'sine';
  frequency = { setValueAtTime: vi.fn() };
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  constructor() {
    grafo.osciladores += 1;
  }
}

class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination: object;
  constructor() {
    this.destination = { nome: 'destination' };
    grafo.destinos.push(this.destination);
  }
  close() {
    grafo.contexteFechados += 1;
    return Promise.resolve();
  }
  createOscillator() {
    return new FakeOscillatorNode();
  }
  createGain() {
    grafo.ganhos += 1;
    return new FakeGainNode();
  }
  createMediaElementSource() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  resume() {
    return Promise.resolve();
  }
}

/** Harness mínimo: um <audio> chaveado pela URL, como os players do app. */
function AudioComUrl({ url }: { url: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  useMediaElementVolume(ref);
  return <audio ref={ref} key={url} src={url} data-audio-url={url} />;
}

/**
 * S28 — o rótulo do fone traz o volume no fim ("Volume dos áudios e vídeos: 80%"), como
 * o do alto-falante; mudo tem rótulo próprio ("Áudios e vídeos mudos"). Por isso a busca
 * é por prefixo: o nome acessível exato depende do valor atual.
 */
const REGEX_LABEL_MIDIA = new RegExp(`${MEDIA_VOLUME_LABEL}|${MEDIA_VOLUME_LABEL_MUTED}`);
const labelAtual = () => screen.getByRole('button', { name: REGEX_LABEL_MIDIA });
const acharLabelAtual = () => screen.findByRole('button', { name: REGEX_LABEL_MIDIA });

describe('volume das mídias — controle, aplicação e separação dos alertas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grafo.osciladores = 0;
    grafo.ganhos = 0;
    grafo.rampas = [];
    grafo.conexoes = [];
    grafo.contexteFechados = 0;
    grafo.destinos = [];
    window.localStorage.clear();
    setVolume(DEFAULT_MEDIA_VOLUME_STATE.volume);
    setMuted(DEFAULT_MEDIA_VOLUME_STATE.muted);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // ─── E38–E40: a separação entre alertas e mídia ──────────────────────────

  it('E38/E39: com a mídia em mudo, o alerta continua saindo no ganho de settings.soundVolume', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    setVolume(0);
    setMuted(true);

    vi.useFakeTimers();
    playNotificationSound('message', 'chime', settingsDeNotificacao.soundVolume);
    vi.runAllTimers();
    vi.useRealTimers();

    const config = SOUND_CONFIGS.chime.message;
    expect(grafo.osciladores).toBe(config.frequencies.length);
    expect(grafo.rampas[0]).toBeCloseTo(
      config.gains[0] * (settingsDeNotificacao.soundVolume / 100),
      5,
    );

    // E39 — a cadeia do alerta TERMINA num `ctx.destination` de verdade: é o que garante
    // que o som sai (com a mídia muda, o volume da mídia em 0 e o store no chão).
    expect(grafo.conexoes).toHaveLength(config.frequencies.length);
    for (const destino of grafo.conexoes) {
      expect(grafo.destinos).toContain(destino);
    }
  });

  it('E40: mexer no volume da mídia não cria nem altera nó WebAudio dos alertas', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const nosAntes = grafo.osciladores + grafo.ganhos;

    setMuted(true);
    setVolume(0);
    setVolume(100);
    setMuted(false);

    expect(grafo.osciladores + grafo.ganhos).toBe(nosAntes);
  });

  it('E38: mexer no volume da mídia não escreve nas configurações de notificação (soundVolume)', () => {
    const chavesAntes = Object.keys(window.localStorage).sort();

    render(<MediaVolumeControl />);
    fireEvent.click(labelAtual());
    act(() => setVolume(10));

    expect(updateSettingsSpy).not.toHaveBeenCalled();
    // só as chaves da própria mídia foram tocadas — nenhuma chave de settings
    expect(Object.keys(window.localStorage).sort()).toEqual(
      [...new Set([...chavesAntes, 'zapp.media.volume', 'zapp.media.muted'])].sort(),
    );
    expect(window.localStorage.getItem('zapp.media.volume')).toBe('10');
  });

  it('E40: o AudioContext da mídia é uma instância DIFERENTE da usada pelos alertas', async () => {
    const instancias: object[] = [];
    class FakeAudioContextContador extends FakeAudioContext {
      constructor() {
        super();
        instancias.push(this);
      }
    }
    vi.stubGlobal('AudioContext', FakeAudioContextContador);

    // Aldeia isolada de módulos: cada caminho cria o SEU contexto e guarda em cache.
    vi.resetModules();

    const alertas = await import('@/utils/notificationSounds');
    vi.useFakeTimers();
    alertas.playNotificationSound('message', 'chime', 70);
    vi.runAllTimers();
    vi.useRealTimers();

    // No iOS `element.volume` é read-only: é o caminho do GainNode que entra.
    const descritorVolume = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
    Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
      configurable: true,
      get: () => 1,
      set: () => {},
    });
    const midia = await import('@/lib/mediaVolumeElement');
    const elementoMidia = document.createElement('audio');
    const desligar = midia.bindMediaVolume(elementoMidia, () => {});
    // E10 — o contexto da mídia nasce no gesto de play, não no mount.
    elementoMidia.dispatchEvent(new Event('play'));
    desligar();
    if (descritorVolume) {
      Object.defineProperty(HTMLMediaElement.prototype, 'volume', descritorVolume);
    }

    expect(instancias).toHaveLength(2);
    expect(instancias[0]).not.toBe(instancias[1]);
  });

  it('E41: alertas e mídia não se importam; as âncoras de separação estão no lugar', () => {
    const ler = (relativo: string) => readFileSync(path.join(process.cwd(), relativo), 'utf8');
    const alertas = ['src/utils/notificationSounds.ts', 'src/components/calls/IncomingCallAlert.tsx'];
    const midia = ['src/lib/mediaVolumeStore.ts', 'src/lib/mediaVolumeElement.ts'];

    for (const arquivo of alertas) {
      expect(ler(arquivo), arquivo).not.toMatch(/^import[^\n]*mediaVolume/m);
    }
    for (const arquivo of midia) {
      expect(ler(arquivo), arquivo).toContain('ÂNCORA (não unificar)');
    }
    expect(ler('src/utils/notificationSounds.ts')).toContain('ÂNCORA (não unificar)');
    // E41 — o toque da chamada é o módulo que mais tenta "unificar" os canais (o ganho
    // dele também sai de settings.soundVolume): a âncora ali tem de estar pinada.
    expect(ler('src/components/calls/IncomingCallAlert.tsx')).toContain('ÂNCORA (não unificar)');
    // o caminho da mídia nunca toca o gráfico dos alertas
    expect(ler('src/lib/mediaVolumeElement.ts')).not.toContain('createOscillator');
  });

  // ─── E07/E12/E44: aplicação no elemento ─────────────────────────────────

  it('E07: aplica o ganho perceptual no elemento de áudio do player', async () => {
    setVolume(40);
    const { container } = render(<AudioComUrl url="https://test.com/a.webm" />);
    const audio = container.querySelector('audio') as HTMLAudioElement;

    await waitFor(() => expect(audio.volume).toBeCloseTo(toGain(40), 5));
  });

  it('E12/D2: dois players compartilham o mesmo valor — trocar de áudio não zera o volume', async () => {
    setVolume(35);
    const { container } = render(
      <>
        <AudioComUrl url="https://test.com/a.webm" />
        <AudioComUrl url="https://test.com/b.webm" />
      </>,
    );
    const [primeiro, segundo] = Array.from(container.querySelectorAll('audio'));

    expect(primeiro.volume).toBeCloseTo(toGain(35), 5);
    expect(segundo.volume).toBeCloseTo(toGain(35), 5);

    act(() => setVolume(90));

    expect(primeiro.volume).toBeCloseTo(toGain(90), 5);
    expect(segundo.volume).toBeCloseTo(toGain(90), 5);
  });

  it('E44: quando a URL assinada renova e o elemento é recriado, o volume é reaplicado', () => {
    setVolume(40);
    const { container, rerender } = render(<AudioComUrl url="https://test.com/assinada-1.webm" />);
    const antigo = container.querySelector('audio') as HTMLAudioElement;
    expect(antigo.volume).toBeCloseTo(toGain(40), 5);

    rerender(<AudioComUrl url="https://test.com/assinada-2.webm" />);

    const novo = container.querySelector('audio') as HTMLAudioElement;
    expect(novo).not.toBe(antigo);
    expect(novo.volume).toBeCloseTo(toGain(40), 5);
  });

  it('E07/E44: o mesmo elemento que recarrega (loadedmetadata, sem re-render) volta ao volume do store', () => {
    setVolume(40);
    const { container } = render(<AudioComUrl url="https://test.com/assinada.webm" />);
    const audio = container.querySelector('audio') as HTMLAudioElement;
    expect(audio.volume).toBeCloseTo(toGain(40), 5);

    // O navegador recarrega o recurso (URL renovada) e o volume nativo volta a 1 —
    // sem re-render do React, o layout effect não roda: quem reaplica é o listener.
    audio.volume = 1;
    act(() => {
      audio.dispatchEvent(new Event('loadedmetadata'));
    });

    expect(audio.volume).toBeCloseTo(toGain(40), 5);
  });

  // ─── E14: integração no player do balão ─────────────────────────────────

  it('E14: o player de áudio do balão traz o controle de volume (recebido e enviado)', async () => {
    const { unmount } = render(
      <AudioMessagePlayer audioUrl="https://test.com/audio.webm" messageId="msg-1" isSent={false} />,
    );
    expect(await acharLabelAtual()).toBeInTheDocument();
    unmount();

    render(<AudioMessagePlayer audioUrl="https://test.com/audio.webm" messageId="msg-2" isSent={true} />);
    expect(await acharLabelAtual()).toBeInTheDocument();
  });

  // ─── E13/E15/E16/E42: o controle em si ──────────────────────────────────

  it('E13: o slider abre no chevron, na vertical, com rótulo acessível e o valor atual', async () => {
    setVolume(45);
    render(<MediaVolumeControl />);

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar volume das mídias' }));

    const slider = await screen.findByRole('slider', { name: MEDIA_VOLUME_SLIDER_LABEL });
    expect(slider).toHaveAttribute('aria-valuenow', '45');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '100');
    expect(slider).toHaveAttribute('aria-orientation', 'vertical');
    expect(screen.getByTestId('media-volume-value').textContent).toBe('45%');
  });

  it('E13/D4: clique no ícone alterna mudo e desmutar devolve o volume anterior', () => {
    setVolume(60);
    render(<MediaVolumeControl />);

    expect(labelAtual()).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(labelAtual());
    expect(getSnapshot().muted).toBe(true);
    expect(screen.getByLabelText(MEDIA_VOLUME_LABEL_MUTED)).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByLabelText(MEDIA_VOLUME_LABEL_MUTED));
    expect(getSnapshot().muted).toBe(false);
    expect(getSnapshot().volume).toBe(60);
  });

  // ─── S28/S29/S39: rótulos do fone e separação do mudo ───────────────────

  it('S28: o rótulo acessível do fone traz o volume — como o do alto-falante', () => {
    act(() => setVolume(80));
    render(<MediaVolumeControl />);

    expect(labelAtual()).toHaveAccessibleName(`${MEDIA_VOLUME_LABEL}: 80%`);

    act(() => setVolume(35));
    expect(labelAtual()).toHaveAccessibleName(`${MEDIA_VOLUME_LABEL}: 35%`);
  });

  it('S28: com a mídia muda o rótulo anuncia o mudo (e não o volume)', () => {
    act(() => setVolume(80));
    act(() => setMuted(true));
    render(<MediaVolumeControl />);

    const controle = labelAtual();
    expect(controle).toHaveAccessibleName(MEDIA_VOLUME_LABEL_MUTED);
    expect(controle).not.toHaveAccessibleName(/80%/);
  });

  it('S29: o painel do fone abre com o nome completo do controle, não com "Volume"', async () => {
    act(() => setVolume(45));
    render(<MediaVolumeControl />);

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar volume das mídias' }));

    expect(MEDIA_VOLUME_SLIDER_LABEL).not.toBe('Volume');
    expect(screen.getByText(MEDIA_VOLUME_SLIDER_LABEL)).toBeInTheDocument();
    expect(await screen.findByRole('slider', { name: MEDIA_VOLUME_SLIDER_LABEL })).toBeInTheDocument();
  });

  it('S39: com a mídia muda o ajuste mexe só no volume (não desmuta) e desmutar devolve o último volume', () => {
    act(() => setVolume(60));
    act(() => setMuted(true));
    render(<MediaVolumeControl />);
    const container = labelAtual().parentElement as HTMLElement;

    act(() => {
      container.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    });
    // Mudo e volume são estados separados: o ajuste não desmuta e não zera o volume.
    expect(getSnapshot().volume).toBe(65);
    expect(getSnapshot().muted).toBe(true);

    fireEvent.click(labelAtual()); // clique = desmudo
    expect(getSnapshot().muted).toBe(false);
    expect(getSnapshot().volume).toBe(65);
    expect(labelAtual()).toHaveAccessibleName(`${MEDIA_VOLUME_LABEL}: 65%`);
  });

  it('E14/E15: a roda do mouse sobre o ícone anda de 5 em 5 e impede a rolagem da página', () => {
    act(() => setVolume(50));
    render(<MediaVolumeControl />);
    const container = labelAtual().parentElement as HTMLElement;

    const scrollParaCima = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    act(() => {
      container.dispatchEvent(scrollParaCima);
    });
    expect(getSnapshot().volume).toBe(55);
    expect(scrollParaCima.defaultPrevented).toBe(true);

    act(() => {
      container.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    });
    expect(getSnapshot().volume).toBe(50);
  });

  it('E15/E42: nas bordas o valor para em 0 e 100 (sem estourar nem virar NaN)', () => {
    act(() => setVolume(0));
    render(<MediaVolumeControl />);
    const container = labelAtual().parentElement as HTMLElement;

    act(() => {
      container.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    });
    expect(getSnapshot().volume).toBe(0);

    act(() => setVolume(100));
    act(() => {
      container.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    });
    expect(getSnapshot().volume).toBe(100);
  });

  it('E16: as setas e o M valem com o foco em qualquer parte do player — e não fora dele', () => {
    setVolume(50);
    const { container } = render(
      <AudioMessagePlayer audioUrl="https://test.com/audio.webm" messageId="msg-e16" isSent={false} />,
    );
    const player = container.firstElementChild as HTMLElement;
    const botaoPlay = player.querySelector('button') as HTMLButtonElement;

    // Foco no botão de PLAY: qualquer parte do player serve (E16), não só o botão do volume.
    fireEvent.keyDown(botaoPlay, { key: 'ArrowUp' });
    expect(getSnapshot().volume).toBe(55);
    fireEvent.keyDown(botaoPlay, { key: 'ArrowDown' });
    expect(getSnapshot().volume).toBe(50);
    fireEvent.keyDown(botaoPlay, { key: 'm' });
    expect(getSnapshot().muted).toBe(true);
    fireEvent.keyDown(botaoPlay, { key: 'm' });
    expect(getSnapshot().muted).toBe(false);

    // Fora do player o app não captura teclado (nenhum atalho global).
    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    expect(getSnapshot().volume).toBe(50);

    // Com o foco no PRÓPRIO botão do volume o mesmo teclado chega pelos dois caminhos
    // (listener nativo do container + `onKeyDown` do React): tem de contar UMA vez.
    fireEvent.keyDown(labelAtual(), { key: 'ArrowUp' });
    expect(getSnapshot().volume).toBe(55);
  });

  it('E30/Sidebar: o botão do fone mostra indicador quando a mídia está muda ou baixa', () => {
    setVolume(20);
    render(
      <TooltipProvider>
        <MediaVolumeControl variant="sidebar" />
      </TooltipProvider>,
    );
    expect(screen.getByTestId('media-volume-low-dot')).toBeInTheDocument();

    act(() => setVolume(80));
    expect(screen.queryByTestId('media-volume-low-dot')).not.toBeInTheDocument();

    act(() => setMuted(true));
    expect(screen.getByTestId('media-volume-low-dot')).toBeInTheDocument();
    expect(screen.getByLabelText(MEDIA_VOLUME_LABEL_MUTED)).toBeInTheDocument();
  });

  it('E26: controle de vídeo sem áudio fica inerte, explica o motivo e não muta nada', async () => {
    setVolume(70);
    render(<MediaVolumeControl variant="overlay" disabled disabledReason="Vídeo sem áudio" />);

    const botao = screen.getByLabelText('Vídeo sem áudio');
    expect(botao).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(botao);
    expect(getSnapshot().muted).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar volume das mídias' }));
    expect(await screen.findByText('Vídeo sem áudio')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: MEDIA_VOLUME_SLIDER_LABEL })).toHaveAttribute('data-disabled');
  });

  // ─── E10: ciclo de vida do AudioContext da mídia ────────────────────────

  /** Simula o iOS: `volume` é read-only, então o caminho do GainNode é o único. */
  function semVolumeNativo<T>(corpo: () => T): T {
    const descritor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
    Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
      configurable: true,
      get: () => 1,
      set: () => {},
    });
    try {
      return corpo();
    } finally {
      if (descritor) Object.defineProperty(HTMLMediaElement.prototype, 'volume', descritor);
    }
  }

  it('E10: o contexto da mídia nasce no primeiro play e fecha quando o último elemento solta', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.resetModules();
    const midia = await import('@/lib/mediaVolumeElement');

    semVolumeNativo(() => {
      const elemento = document.createElement('audio');
      const desligar = midia.bindMediaVolume(elemento, () =>
        midia.applyMediaVolume(elemento, 0.5, false),
      );

      // No mount NADA de contexto: criado fora de um gesto o navegador o entrega
      // suspenso, o áudio sai mudo e `resume()` não sai de `suspended`.
      expect(grafo.ganhos).toBe(0);

      // O play é o gesto: aí o contexto nasce e o ganho entra.
      elemento.dispatchEvent(new Event('play'));
      expect(grafo.ganhos).toBe(1);

      desligar();
      expect(grafo.contexteFechados).toBe(1);
    });
  });

  it('E10: com dois players na tela o contexto só fecha quando o ÚLTIMO solta', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.resetModules();
    const midia = await import('@/lib/mediaVolumeElement');

    semVolumeNativo(() => {
      const um = document.createElement('audio');
      const dois = document.createElement('audio');
      const soltarUm = midia.bindMediaVolume(um, () => midia.applyMediaVolume(um, 0.5, false));
      const soltarDois = midia.bindMediaVolume(dois, () => midia.applyMediaVolume(dois, 0.5, false));

      um.dispatchEvent(new Event('play'));
      dois.dispatchEvent(new Event('play'));
      expect(grafo.ganhos).toBe(2);

      soltarUm();
      // O outro continua na tela: fechar aqui emudeceria quem ainda está tocando.
      expect(grafo.contexteFechados).toBe(0);

      soltarDois();
      expect(grafo.contexteFechados).toBe(1);
    });
  });
});
