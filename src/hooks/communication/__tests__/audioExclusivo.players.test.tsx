import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * t_a8b2a47f — "áudios da conversa tocam um por vez e guardam posição e velocidade".
 *
 * O que é medido AQUI é o balão REAL (`AudioMessagePlayer` → `useAudioPlayer`) sobre o
 * `HTMLMediaElement` REAL do jsdom: só `play`/`pause`/`load`, que o jsdom não implementa,
 * são dublados (mesma fronteira do `mediaVolume.players.test.tsx`). O store de
 * exclusividade e o de posição/velocidade NÃO são dublados — é o caminho de verdade.
 *
 * Cobre o que o cartão pede:
 *  1. dois players: tocar o B PAUSA o A e o botão do A volta para "tocar" (pausa externa);
 *  2. desmontar (lista virtualizada rolando o balão para fora) pausa sem perder o ponto e
 *     remontar o MESMO `messageId` devolve posição e velocidade.
 */

// ─── Dublês de fronteira ──────────────────────────────────────────────────

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
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
  SUPABASE_URL: 'https://projeto-de-teste.supabase.co',
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })},
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
  getLogger: () => ({ error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() , withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })}),
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

// ─── Módulos reais ────────────────────────────────────────────────────────

import { AudioMessagePlayer } from '@/components/inbox/AudioMessagePlayer';
import { getPlayingAudioId } from '@/hooks/chat/useExclusiveAudio';
import { forgetAudioState, readAudioState } from '@/lib/audioPlayerState';

// ─── Ferramentas ──────────────────────────────────────────────────────────

const IDS = ['msg-a', 'msg-b', 'msg-remonta'];

function montar(messageId: string, arquivo: string) {
  return render(
    <AudioMessagePlayer audioUrl={`https://cdn.test/${arquivo}`} messageId={messageId} isSent={false} />,
  );
}

function midiaDo(container: HTMLElement): HTMLAudioElement {
  const elemento = container.querySelector('audio');
  if (!elemento) throw new Error('o balão não renderizou um <audio>');
  return elemento as HTMLAudioElement;
}

/** O botão de tocar/pausar é o primeiro botão do balão (o do ícone Play/Pause). */
function botaoDeTocar(container: HTMLElement): HTMLButtonElement {
  return container.querySelectorAll('button')[0] as HTMLButtonElement;
}

function botaoDeVelocidade(container: HTMLElement): HTMLButtonElement {
  const botao = container.querySelector('[title="Velocidade"]');
  if (!botao) throw new Error('o balão não renderizou o botão de velocidade');
  return botao as HTMLButtonElement;
}

/** O que o atendente VÊ: ícone de pausa = tocando; de play = parado. */
function mostraTocando(container: HTMLElement): boolean {
  return container.querySelector('.lucide-pause') !== null;
}

beforeEach(() => {
  vi.clearAllMocks();
  IDS.forEach((id) => forgetAudioState(id));

  // O jsdom não implementa a reprodução; o resto do HTMLMediaElement é real.
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  HTMLMediaElement.prototype.pause = vi.fn();
  HTMLMediaElement.prototype.load = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  IDS.forEach((id) => forgetAudioState(id));
});

describe('t_a8b2a47f — exclusividade e memória de reprodução no balão da conversa', () => {
  it('tocar o segundo áudio PAUSA o primeiro e o botão do primeiro volta para "tocar"', async () => {
    const a = montar('msg-a', 'a.webm');
    const b = montar('msg-b', 'b.webm');
    const audioA = midiaDo(a.container);
    const audioB = midiaDo(b.container);

    expect(mostraTocando(a.container), 'nenhum tocando no começo').toBe(false);
    expect(getPlayingAudioId()).toBeNull();

    // A começa a tocar: assume a exclusividade e o botão vira pausa.
    fireEvent.click(botaoDeTocar(a.container));
    await act(async () => {});
    expect(getPlayingAudioId(), 'A é o áudio atual').toBe('msg-a');
    expect(mostraTocando(a.container), 'o botão de A mostra pausa').toBe(true);

    // B começa a tocar: A é PAUSADO antes (é a pausa externa que o botão de A tem de seguir).
    fireEvent.click(botaoDeTocar(b.container));
    await act(async () => {});
    expect(getPlayingAudioId(), 'B virou o áudio atual').toBe('msg-b');
    expect(audioA.pause, 'o elemento de A foi pausado').toHaveBeenCalled();
    expect(mostraTocando(a.container), 'o botão de A voltou para tocar').toBe(false);
    expect(mostraTocando(b.container), 'o botão de B mostra pausa').toBe(true);

    // E o caminho de volta: A toca de novo e pausa B.
    fireEvent.click(botaoDeTocar(a.container));
    await act(async () => {});
    expect(getPlayingAudioId()).toBe('msg-a');
    expect(mostraTocando(a.container)).toBe(true);
    expect(mostraTocando(b.container)).toBe(false);
    expect(audioB.pause).toHaveBeenCalled();
  });

  it('pausa que não veio do botão (evento `pause` do elemento) também o devolve para "tocar"', async () => {
    const a = montar('msg-a', 'a.webm');
    const audio = midiaDo(a.container);

    fireEvent.click(botaoDeTocar(a.container));
    await act(async () => {});
    expect(mostraTocando(a.container)).toBe(true);

    // Controles do sistema / navegador pausando a mídia: o botão não pode continuar em pausa.
    act(() => {
      audio.dispatchEvent(new Event('pause'));
    });
    expect(mostraTocando(a.container), 'o botão acompanha a pausa de fora').toBe(false);
  });

  it('desmontar tocando pausa sem perder o ponto; remontar o mesmo messageId devolve posição e velocidade', async () => {
    const a = montar('msg-remonta', 'recado.webm');
    const audio = midiaDo(a.container);

    act(() => {
      audio.dispatchEvent(new Event('loadedmetadata'));
    });
    fireEvent.click(botaoDeTocar(a.container));
    await act(async () => {});

    act(() => {
      audio.currentTime = 42;
      audio.dispatchEvent(new Event('timeupdate'));
    });

    const velocidade = botaoDeVelocidade(a.container);
    fireEvent.click(velocidade); // 1x → 1,25x
    fireEvent.click(velocidade); // 1,25x → 1,5x
    expect(botaoDeVelocidade(a.container).textContent, 'a velocidade escolhida aparece no botão').toBe('1.5x');
    expect(readAudioState('msg-remonta')).toMatchObject({ currentTime: 42, playbackRate: 1.5 });

    // Rolar o balão para fora da janela virtualizada desmonta o áudio.
    a.unmount();
    expect(audio.pause, 'desmontar pausou o som (sem som fantasma)').toHaveBeenCalled();
    expect(readAudioState('msg-remonta')!.currentTime, 'o ponto sobreviveu ao desmonte').toBe(42);

    // Voltando a rolar para cima, o mesmo balão remonta.
    const b = montar('msg-remonta', 'recado.webm');
    const audioDeNovo = midiaDo(b.container);
    expect(botaoDeVelocidade(b.container).textContent, 'a velocidade voltou já no mount').toBe('1.5x');

    act(() => {
      audioDeNovo.dispatchEvent(new Event('loadedmetadata'));
    });
    expect(audioDeNovo.playbackRate, 'a velocidade está no elemento').toBe(1.5);
    expect(audioDeNovo.currentTime, 'a posição está no elemento').toBe(42);
    expect(mostraTocando(b.container), 'não começa tocando sozinho').toBe(false);
  });

  it('`load()` (renovação da URL assinada) reaplica a velocidade sem voltar a posição', async () => {
    const a = montar('msg-a', 'a.webm');
    const audio = midiaDo(a.container);

    act(() => {
      audio.dispatchEvent(new Event('loadedmetadata'));
      audio.currentTime = 30;
      audio.dispatchEvent(new Event('timeupdate'));
    });

    fireEvent.click(botaoDeVelocidade(a.container));
    fireEvent.click(botaoDeVelocidade(a.container)); // 1,5x
    expect(audio.playbackRate, 'a velocidade escolhida está no elemento').toBe(1.5);

    // O `load()` da renovação da URL assinada REINICIA o elemento em 1x — e o navegador
    // dispara `ratechange` por causa disso. A escolha do atendente tem de sobreviver.
    audio.playbackRate = 1;
    audio.currentTime = 0;
    expect(audio.playbackRate, 'o reset do load() não derruba a velocidade escolhida').toBe(1.5);
    expect(readAudioState('msg-a')!.playbackRate, 'e o guardado continua 1,5x').toBe(1.5);

    act(() => {
      audio.dispatchEvent(new Event('loadedmetadata'));
    });

    expect(audio.playbackRate, 'a velocidade volta depois do load()').toBe(1.5);
    expect(audio.currentTime, 'a posição NÃO foi rebobinada para o ponto antigo').toBe(0);
  });
});
