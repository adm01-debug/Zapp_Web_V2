import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Q06 (etapas S41–S44 do plano `docs/plans/PLANO_CONTROLES_VOLUME_SIDEBAR_50_ETAPAS_2026-10-07.md`):
 * "o som obedece de verdade nos players".
 *
 * O medido é o `element.volume` / `element.muted` do HTMLMediaElement REAL — o jsdom
 * implementa os dois (e os listeners), então o valor lido é o mesmo que o navegador
 * tocaria. O que o jsdom NÃO implementa (`play`/`pause`/`load`) é preenchido no
 * `beforeEach`, porque sem isso o clique do player estoura dentro do handler.
 *
 * O caminho do volume NÃO é dublado: quem aplica é `useMediaElementVolume` →
 * `mediaVolumeElement` → `mediaVolumeStore` de verdade, e os players são os
 * componentes reais. Os dublês ficam na FRONTEIRA: rede (cliente Supabase) e a
 * gravação da chamada (que busca os bytes por HTTP).
 *
 * A bateria de cada player é a que o cartão pede — volume global alterado →
 * `element.volume` muda; mudo → `element.muted`; sair do mudo devolve o último
 * volume; desmontar solta o listener. Quem não obedece está no relato do cartão.
 */

// ─── Dublês de fronteira ──────────────────────────────────────────────────

const { supabaseFake } = vi.hoisted(() => ({
  supabaseFake: {
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(async () => ({ data: null, error: new Error('sem assinatura no teste') })),
      })),
    },
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
    from: vi.fn(() => ({ update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) })),
    auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: null })) },
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: supabaseFake,
  SUPABASE_URL: 'https://projeto-de-teste.supabase.co',
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

vi.mock('framer-motion', () => {
  const semMovimento = (tag: string) =>
    React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
      void whileHover; void whileTap; void initial; void animate; void exit; void transition; void variants;
      return React.createElement(tag, { ...rest, ref });
    });
  return {
    motion: {
      div: semMovimento('div'),
      span: semMovimento('span'),
      button: semMovimento('button'),
      img: semMovimento('img'),
    },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});

// A gravação da chamada chega por HTTP (`supabase.auth` + fetch na Edge). Aqui só os
// bytes: quem os transforma em `blob:` e liga o volume é o `RecordingPlayer` real.
vi.mock('@/hooks/calls/useCallRecording', () => ({
  useCallRecording: () => ({
    disponivel: true,
    blob: new Blob(['gravacao-de-teste'], { type: 'audio/mpeg' }),
    buscando: false,
  }),
}));

// ─── O alerta da chamada (item 5 do cartão) ───────────────────────────────
// O toque é um ALERTA (WebAudio com ganho de `settings.soundVolume`); a mídia de
// conversa é `HTMLMediaElement`. O cartão pede para provar que o alerta NÃO segue o
// volume das mídias — por isso ele é montado de verdade, com o grafo WebAudio dublado
// (fronteira: o jsdom não tem WebAudio).

const { contextosDoAlerta, ganhosDoAlerta } = vi.hoisted(() => ({
  contextosDoAlerta: [] as { state: string }[],
  ganhosDoAlerta: [] as { valor: number }[],
}));

vi.mock('@/hooks/communication/useIncomingCallListener', () => ({
  useIncomingCallListener: () => ({
    incomingCall: {
      id: 'n1',
      callId: 'k1',
      contact_id: 'c1',
      contact_name: 'Contato de teste',
      contact_phone: '+55 11 90000-0000',
      is_video: false,
      whatsapp_connection_id: 'w1',
      started_at: '2026-10-09T00:00:00Z',
    },
    dismissCall: vi.fn(),
  }),
}));

vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => ({
    accept: vi.fn(),
    reject: vi.fn(),
    session: { status: 'ringing_in', sessionId: 'k1', answeredAt: null },
  }),
}));

vi.mock('@/hooks/communication/useCalls', () => ({
  useCalls: () => ({ answerCall: vi.fn(), missCall: vi.fn() }),
}));

vi.mock('@/hooks/calls/useCallChannels', () => ({
  useCallChannels: () => ({
    voip: { channel: 'voip', canDial: true, canReceive: true, canRecord: false, canReject: true },
    whatsapp: {
      channel: 'whatsapp', canDial: false, canReceive: true, canRecord: false, canReject: false,
      reason: 'whatsapp_no_outbound',
    },
  }),
}));

// Volume dos alertas = 70 (o valor é o de `settings.soundVolume`; o esperado do toque é
// `70/100 × 0,2 = 0,14`, com o teto de ganho do achado B10).
vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: { soundEnabled: true, soundVolume: 70 },
    isQuietHours: () => false,
  }),
}));

vi.mock('@/components/calls/CallDialog', () => ({ CallDialog: () => null }));

// ─── Imports dos módulos reais ────────────────────────────────────────────

import { MediaPreviewDialog } from '@/components/inbox/media-gallery/MediaPreviewDialog';
import type { MediaItem } from '@/components/inbox/media-gallery/mediaUtils';
import { AudioMessagePlayer } from '@/components/inbox/AudioMessagePlayer';
import { RecordingPlayer } from '@/components/calls/RecordingPlayer';
import { VideoFullscreen } from '@/components/inbox/VideoFullscreen';
import { VideoPreview } from '@/components/inbox/MediaPreview';
import { MediaContent } from '@/components/team-chat/teamChatParts';
import { TranscriptionContactGroup } from '@/components/transcriptions/TranscriptionContactGroup';
import { AudioPlayButton } from '@/components/inbox/tabs/AudioPlayButton';
import { IncomingCallAlert } from '@/components/calls/IncomingCallAlert';
import type { TeamMessage } from '@/hooks/team-chat/teamChatTypes';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { getSnapshot, setMuted, setVolume, toGain } from '@/lib/mediaVolumeStore';

/** Ganho do toque da chamada com `soundVolume = 70` e o teto de 0,2 do achado B10. */
const GANHO_ESPERADO_DO_TOQUE = 0.14;

// ─── Ferramentas de medição ───────────────────────────────────────────────

const AJUSTE_PADRAO = 80;
const AJUSTE_ALTERADO = 30;

/** Um `HTMLMediaElement` REAL do jsdom; sem `container`, procura no documento. */
function midiaDoPlayer(container?: HTMLElement): HTMLMediaElement {
  const elemento = (container ?? document.body).querySelector('audio, video');
  if (!elemento) throw new Error('o player não renderizou um HTMLMediaElement');
  return elemento as HTMLMediaElement;
}

interface Montagem {
  container: HTMLElement;
  unmount: () => void;
}

/**
 * A bateria do cartão sobre o elemento REAL de um player. Devolve o elemento para o
 * teste continuar medindo depois dela.
 *
 * A bateria prova que o valor já vale no mount, antes de qualquer mudança do store.
 */
function bateriaDoVolume(
  montar: () => Montagem,
  obterElemento: (montagem: Montagem) => HTMLMediaElement,
): HTMLMediaElement {
  const montagem = montar();
  const elemento = obterElemento(montagem);

  // 1) o volume global chega no mount, já com a curva perceptual do app
  expect(elemento.volume, 'volume no mount').toBeCloseTo(toGain(AJUSTE_PADRAO), 5);

  // 1b) os listeners do elemento também já estão ligados no mount: sujo o volume à mão e um
  // `loadedmetadata` (a URL renovou, o elemento recarregou) devolve o valor do store. Um
  // player que só se ligasse depois de um re-render falharia aqui.
  elemento.volume = 0.2;
  elemento.dispatchEvent(new Event('loadedmetadata'));
  expect(elemento.volume, 'loadedmetadata no mount').toBeCloseTo(toGain(AJUSTE_PADRAO), 5);

  act(() => setVolume(AJUSTE_ALTERADO));
  expect(elemento.volume, 'volume global alterado').toBeCloseTo(toGain(AJUSTE_ALTERADO), 5);

  // 2) mudo → elemento mudo, sem perder o volume escolhido
  act(() => setMuted(true));
  expect(elemento.muted, 'mudo').toBe(true);
  expect(getSnapshot().volume, 'o mudo não zera o volume').toBe(AJUSTE_ALTERADO);

  // 3) sair do mudo devolve o último volume
  act(() => setMuted(false));
  expect(elemento.muted, 'desmudo').toBe(false);
  expect(elemento.volume, 'volume restaurado depois do mudo').toBeCloseTo(toGain(AJUSTE_ALTERADO), 5);

  // 4) desmontar solta o listener: nem o store nem os eventos do elemento o alcançam
  montagem.unmount();
  elemento.volume = 0.5;
  act(() => setVolume(100));
  elemento.dispatchEvent(new Event('loadedmetadata'));
  elemento.dispatchEvent(new Event('play'));
  expect(elemento.volume, 'volume depois do unmount').toBeCloseTo(0.5, 5);
  expect(elemento.volume).not.toBeCloseTo(toGain(100), 2);

  return elemento;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────

const itemDaGaleria = (tipo: 'video' | 'audio', nome: string): MediaItem => ({
  id: `item-${tipo}`,
  url: `https://cdn.test/${nome}`,
  type: tipo,
  filename: nome,
  created_at: '2026-10-09T12:00:00.000Z',
  caption: null,
});

const mensagemDaEquipe = (tipo: 'video' | 'audio', nome: string): TeamMessage => ({
  id: `msg-${tipo}`,
  conversation_id: 'conv-1',
  sender_id: 'perfil-1',
  content: '',
  message_type: 'media',
  media_url: `https://cdn.test/${nome}`,
  media_type: tipo,
  media_bucket: null,
  media_path: null,
  reply_to_id: null,
  is_edited: false,
  created_at: '2026-10-09T12:00:00.000Z',
  updated_at: '2026-10-09T12:00:00.000Z',
});

const itemDaAbaArquivos = (nome: string): ContactMediaItem => ({
  id: 'midia-1',
  url: `https://cdn.test/${nome}`,
  type: 'audio',
  filename: nome,
  displayName: nome,
  extension: 'mp3',
  senderLabel: null,
  created_at: '2026-10-09T12:00:00.000Z',
  caption: null,
  mimetype: 'audio/mpeg',
  size: 1024,
  meta: null,
  sender: 'contact',
});

const transcricaoComAudio = {
  id: 'transcricao-1',
  content: 'mensagem do contato',
  transcription: 'olá, tudo bem?',
  media_url: 'https://cdn.test/gravacao-da-chamada.mp3',
  created_at: '2026-10-09T12:00:00.000Z',
  contact_id: 'contato-1',
  contact_name: 'Contato de teste',
  contact_phone: '+55 11 90000-0000',
  contact_avatar: null,
};

/** Elementos criados por `new Audio()` (o player do cartão não usa `<audio>` no DOM). */
const audiosCriados: HTMLAudioElement[] = [];

function capturarAudios(): void {
  const Real = window.Audio;
  function AudioEspiao(this: unknown, src?: string): HTMLAudioElement {
    const elemento = new Real(src);
    audiosCriados.push(elemento);
    return elemento;
  }
  vi.stubGlobal('Audio', AudioEspiao);
}

/** Grafo WebAudio mínimo do jsdom (fronteira): guarda o ganho do toque e o contexto. */
function FakeAudioContextDeAlerta(this: unknown): AudioContext {
  const ganho = { valor: 0 };
  ganhosDoAlerta.push(ganho);
  contextosDoAlerta.push({ state: 'running' });
  return {
    state: 'running',
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createOscillator: () => ({
      type: 'sine',
      frequency: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }),
    createGain: () => ({
      get gain() {
        return {
          get value() { return ganho.valor; },
          set value(novo: number) { ganho.valor = novo; },
        };
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
  } as unknown as AudioContext;
}

// ─── Ciclo de vida ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  setMuted(false);
  setVolume(AJUSTE_PADRAO);

  // O jsdom não implementa a reprodução; o resto do HTMLMediaElement é real.
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  HTMLMediaElement.prototype.pause = vi.fn();
  HTMLMediaElement.prototype.load = vi.fn();

  audiosCriados.length = 0;
  contextosDoAlerta.length = 0;
  ganhosDoAlerta.length = 0;
  URL.createObjectURL = vi.fn(() => 'blob:teste');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ─── S41 — janela de visualização do arquivo ──────────────────────────────

describe('S41 — MediaPreviewDialog (janela do arquivo) obedece o volume das mídias', () => {
  /**
   * O visualizador usa o portal com contêiner explícito: o conteúdo nasce no primeiro commit
   * do Radix e o `useMediaElementVolume` recebe a ref no mount. Por isso esta bateria exige o
   * volume inicial, antes de alterar o store ou disparar eventos do elemento.
   */
  it('o vídeo do visualizador obedece ao volume global (S41)', () => {
    bateriaDoVolume(
      () => render(
        <MediaPreviewDialog item={itemDaGaleria('video', 'entrada.mp4')} open onOpenChange={() => {}} />,
      ),
      () => midiaDoPlayer(),
    );
  });

  it('o áudio do visualizador obedece ao volume global (S41)', () => {
    bateriaDoVolume(
      () => render(
        <MediaPreviewDialog item={itemDaGaleria('audio', 'recado.mp3')} open onOpenChange={() => {}} />,
      ),
      () => midiaDoPlayer(),
    );
  });
});

// ─── S42 — player de mensagem de áudio ────────────────────────────────────

describe('S42 — AudioMessagePlayer (via useAudioPlayer) obedece', () => {
  it('o áudio do balão obedece (volume, mudo, desmudo e desmontar)', () => {
    bateriaDoVolume(
      () => render(
        <AudioMessagePlayer audioUrl="https://cdn.test/audio-do-balao.webm" messageId="msg-1" isSent={false} />,
      ),
      (montagem) => midiaDoPlayer(montagem.container),
    );
  });
});

// ─── S44 — vídeo e gravação de chamada ────────────────────────────────────

describe('S44 — vídeo em tela cheia, preview do balão e gravação da chamada', () => {
  it('o vídeo da tela cheia obedece (volume, mudo, desmudo e desmontar)', () => {
    bateriaDoVolume(
      () => render(<VideoFullscreen url="https://cdn.test/clipe-em-tela-cheia.mp4" onClose={() => {}} />),
      () => midiaDoPlayer(),
    );
  });

  it('a gravação da chamada obedece (volume, mudo, desmudo e desmontar)', () => {
    bateriaDoVolume(
      () => render(<RecordingPlayer callId="chamada-1" recordingStatus="available" />),
      (montagem) => midiaDoPlayer(montagem.container),
    );
  });

  it('o preview de vídeo do balão obedece o volume global, com o mudo deliberado (E20)', () => {
    const montagem = render(<VideoPreview url="https://cdn.test/preview.mp4" isSent={false} />);
    const elemento = midiaDoPlayer(montagem.container);

    // E20 — o preview do balão é deliberadamente mudo (`manageMuted: false`): o volume
    // global entra no elemento, mas o mudo dele continua sendo do componente.
    expect(elemento.muted, 'preview mudo por desenho').toBe(true);
    expect(elemento.volume, 'volume no mount').toBeCloseTo(toGain(AJUSTE_PADRAO), 5);

    act(() => setVolume(AJUSTE_ALTERADO));
    expect(elemento.volume, 'volume global alterado').toBeCloseTo(toGain(AJUSTE_ALTERADO), 5);

    // O mudo global mantém o preview mudo — e desligá-lo não desmuta o preview.
    act(() => setMuted(true));
    expect(elemento.muted).toBe(true);
    act(() => setMuted(false));
    expect(elemento.muted, 'o preview segue mudo sem o mudo global').toBe(true);
    expect(elemento.volume, 'volume restaurado depois do mudo').toBeCloseTo(toGain(AJUSTE_ALTERADO), 5);

    montagem.unmount();
    elemento.volume = 0.5;
    act(() => setVolume(100));
    elemento.dispatchEvent(new Event('loadedmetadata'));
    elemento.dispatchEvent(new Event('play'));
    expect(elemento.volume, 'volume depois do unmount').toBeCloseTo(0.5, 5);
  });
});

// ─── Chat interno e transcrições ──────────────────────────────────────────

describe('chat interno da equipe e transcrições obedecem', () => {
  it('o vídeo do chat interno obedece (volume, mudo, desmudo e desmontar)', () => {
    bateriaDoVolume(
      () => render(<MediaContent msg={mensagemDaEquipe('video', 'video-da-equipe.mp4')} />),
      (montagem) => midiaDoPlayer(montagem.container),
    );
  });

  it('o áudio do chat interno obedece (volume, mudo, desmudo e desmontar)', () => {
    bateriaDoVolume(
      () => render(<MediaContent msg={mensagemDaEquipe('audio', 'audio-da-equipe.mp3')} />),
      (montagem) => midiaDoPlayer(montagem.container),
    );
  });

  it('o áudio da transcrição obedece (volume, mudo, desmudo e desmontar)', () => {
    bateriaDoVolume(
      () => {
        const montagem = render(
          <TranscriptionContactGroup
            contact={{ id: 'contato-1', name: 'Contato de teste', phone: '+55 11 90000-0000', avatar: null }}
            transcriptions={[transcricaoComAudio]}
            isExpanded
            onToggle={() => {}}
            index={0}
          />,
        );
        fireEvent.click(screen.getByRole('button', { name: /Ouvir/ }));
        return montagem;
      },
      (montagem) => midiaDoPlayer(montagem.container),
    );
  });
});

// ─── S43 — player novo do cartão (A01) ────────────────────────────────────

describe('S43 — AudioPlayButton (player do cartão da aba Arquivos)', () => {
  it('o áudio criado por `new Audio()` obedece (volume, mudo, desmudo e desmontar)', () => {
    capturarAudios();
    bateriaDoVolume(
      () => {
        const montagem = render(<AudioPlayButton item={itemDaAbaArquivos('audio-do-cartao.mp3')} />);
        // A06b: o rótulo acessível do play cita o nome do arquivo (aqui, o do cartão).
        fireEvent.click(screen.getByRole('button', { name: 'Tocar áudio audio-do-cartao.mp3' }));
        return montagem;
      },
      () => {
        const elemento = audiosCriados[0];
        if (!elemento) throw new Error('o player do cartão não criou o elemento de áudio');
        return elemento;
      },
    );
  });
});

// ─── Item 5 — os alertas NÃO seguem o volume das mídias ───────────────────

describe('os alertas da chamada não seguem o volume das mídias', () => {
  it('com a mídia no chão (volume 0 e muda), o toque sai no ganho de settings.soundVolume', () => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FakeAudioContextDeAlerta);

    // A mídia de conversa vai para o chão ANTES de o alerta nascer.
    act(() => setVolume(0));
    act(() => setMuted(true));

    render(<IncomingCallAlert />);

    expect(contextosDoAlerta).toHaveLength(1);
    expect(ganhosDoAlerta).toHaveLength(1);
    expect(ganhosDoAlerta[0].valor, 'ganho do toque').toBeCloseTo(GANHO_ESPERADO_DO_TOQUE, 5);

    // Mexer no volume/mudo das mídias depois não encosta no ganho do alerta.
    act(() => setVolume(100));
    act(() => setMuted(false));
    act(() => setVolume(15));

    expect(ganhosDoAlerta[0].valor, 'ganho do toque depois de mexer na mídia')
      .toBeCloseTo(GANHO_ESPERADO_DO_TOQUE, 5);
    expect(ganhosDoAlerta).toHaveLength(1);
  });
});
