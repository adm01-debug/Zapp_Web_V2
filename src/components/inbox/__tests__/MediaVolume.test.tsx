import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React, { useRef } from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

const { updateSettingsSpy } = vi.hoisted(() => ({ updateSettingsSpy: vi.fn() }));

// E38 — o controle de mídia não pode encostar nas configurações de notificação.
vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: { soundEnabled: true, soundVolume: 70 },
    updateSettings: updateSettingsSpy,
    isSaving: false,
  }),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
      return React.createElement('div', { ...rest, ref });
    }),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

// ─── jsdom não traz ResizeObserver, que o Popper do Radix usa para medir o
// ─── conteúdo do popover. Stub mínimo (atribuição direta, fora do `stubGlobal`,
// ─── para sobreviver ao `unstubAllGlobals` do afterEach).
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}

import { MediaVolumeControl, MEDIA_VOLUME_LABEL, MEDIA_VOLUME_LABEL_MUTED } from '../MediaVolumeControl';
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
const grafo = { osciladores: 0, ganhos: 0, rampas: [] as number[] };

class FakeGainNode {
  gain = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn((valor: number) => {
      grafo.rampas.push(valor);
    }),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
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
  destination = {};
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

const labelAtual = () =>
  screen.getByRole('button', { name: new RegExp(`${MEDIA_VOLUME_LABEL}|${MEDIA_VOLUME_LABEL_MUTED}`) });

describe('volume das mídias — controle, aplicação e separação dos alertas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grafo.osciladores = 0;
    grafo.ganhos = 0;
    grafo.rampas = [];
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
    playNotificationSound('message', 'chime', 70);
    vi.runAllTimers();
    vi.useRealTimers();

    const config = SOUND_CONFIGS.chime.message;
    expect(grafo.osciladores).toBe(config.frequencies.length);
    expect(grafo.rampas[0]).toBeCloseTo(config.gains[0] * 0.7, 5);
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
    midia.applyMediaVolume(document.createElement('audio'), 0.5, false);
    if (descritorVolume) {
      Object.defineProperty(HTMLMediaElement.prototype, 'volume', descritorVolume);
    }

    expect(instancias).toHaveLength(2);
    expect(instancias[0]).not.toBe(instancias[1]);
  });

  it('E41: alertas e mídia não se importam; as âncoras de separação estão no lugar', () => {
    const ler = (relativo: string) => readFileSync(path.join(process.cwd(), relativo), 'utf8');
    const alertas = ['src/utils/notificationSounds.ts', 'src/utils/notificationSound.ts', 'src/components/calls/IncomingCallAlert.tsx'];
    const midia = ['src/lib/mediaVolumeStore.ts', 'src/lib/mediaVolumeElement.ts'];

    for (const arquivo of alertas) {
      expect(ler(arquivo), arquivo).not.toMatch(/^import[^\n]*mediaVolume/m);
    }
    for (const arquivo of midia) {
      expect(ler(arquivo), arquivo).toContain('ÂNCORA (não unificar)');
    }
    expect(ler('src/utils/notificationSounds.ts')).toContain('ÂNCORA (não unificar)');
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
    expect(await screen.findByLabelText(MEDIA_VOLUME_LABEL)).toBeInTheDocument();
    unmount();

    render(<AudioMessagePlayer audioUrl="https://test.com/audio.webm" messageId="msg-2" isSent={true} />);
    expect(await screen.findByLabelText(MEDIA_VOLUME_LABEL)).toBeInTheDocument();
  });

  // ─── E13/E15/E16/E42: o controle em si ──────────────────────────────────

  it('E13: o slider abre no chevron, na vertical, com rótulo acessível e o valor atual', async () => {
    setVolume(45);
    render(<MediaVolumeControl />);

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar volume das mídias' }));

    const slider = await screen.findByRole('slider', { name: 'Volume das mídias' });
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

  it('E16: as setas e o M só agem com o foco no botão — não há captura global de teclado', () => {
    setVolume(50);
    render(<MediaVolumeControl />);

    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    expect(getSnapshot().volume).toBe(50);

    const botao = labelAtual();
    fireEvent.keyDown(botao, { key: 'ArrowUp' });
    expect(getSnapshot().volume).toBe(55);

    fireEvent.keyDown(botao, { key: 'ArrowDown' });
    expect(getSnapshot().volume).toBe(50);

    fireEvent.keyDown(botao, { key: 'm' });
    expect(getSnapshot().muted).toBe(true);
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
    expect(screen.getByRole('slider', { name: 'Volume das mídias' })).toHaveAttribute('data-disabled');
  });
});
