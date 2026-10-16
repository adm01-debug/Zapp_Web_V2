/**
 * E17 — acessibilidade do player de áudio (`AudioMessagePlayer.tsx`).
 *
 * O defeito: o botão play/pausa/recarregar só tinha ícone (violação
 * `button-name`), a barra de posição era `<div onClick>` (invisível para o
 * teclado e para o leitor de tela — sem `role="slider"`/`aria-valuenow`), o
 * selo "Falhou - Tentar novamente" era `motion.div onClick` (não era botão),
 * o botão de transcrição só tinha `title`, o status da transcrição não era
 * anunciado (`aria-live`) e as 30 barras do waveform animavam sempre.
 *
 * A prova renderiza o componente REAL e afirma o que o DOM expõe. Os mocks são
 * os mesmos dos testes vizinhos do player (`AudioMessagePlayer.transcricao.test.tsx`):
 * `framer-motion` e o cliente supabase. O mock de `motion.div` só copia as props
 * de animação para `data-*` (não injeta estado) — é o que permite afirmar, no
 * caso de "reduzir movimento", que o pedido de animação infinita desapareceu.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { axe } from 'vitest-axe';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: 'https://test.com/audio.webm' } })),
      })),
    },
    functions: { invoke: invokeMock },
    from: vi.fn(),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: (props: Record<string, unknown>) => {
      const { children, animate, transition, initial, exit, whileHover, whileTap, variants, ...rest } =
        props as {
          children?: React.ReactNode;
          animate?: unknown;
          transition?: { repeat?: unknown };
          initial?: unknown;
          exit?: unknown;
          whileHover?: unknown;
          whileTap?: unknown;
          variants?: unknown;
        } & Record<string, unknown>;
      void initial; void exit; void whileHover; void whileTap; void variants;
      return React.createElement('div', {
        ...rest,
        'data-animate': animate ? JSON.stringify(animate) : undefined,
        'data-repeat': transition && transition.repeat !== undefined ? String(transition.repeat) : undefined,
      }, children);
    },
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
}));

import { AudioMessagePlayer } from '../AudioMessagePlayer';

const PROPS = { audioUrl: 'https://test.com/audio.webm', messageId: 'msg-a11y', isSent: false };

function renderPlayer(overrides: Partial<React.ComponentProps<typeof AudioMessagePlayer>> = {}) {
  return render(<AudioMessagePlayer {...PROPS} {...overrides} />);
}

/** Preferência de movimento do sistema, como o navegador entrega ao hook. */
function definirReduzirMovimento(ativo: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: ativo,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

describe('AudioMessagePlayer — acessibilidade dos controles (E17)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invokeMock.mockResolvedValue({ data: { transcription: 'texto', messageId: 'msg-a11y' }, error: null });
    definirReduzirMovimento(false);
  });

  afterEach(cleanup);

  it('os botões de ícone têm nome acessível (não só ícone)', () => {
    renderPlayer();
    expect(screen.getByRole('button', { name: 'Reproduzir áudio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Velocidade de reprodução: 1x' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Transcrever áudio' })).toBeInTheDocument();
  });

  it('axe não acusa violação séria nem crítica', async () => {
    const { container } = renderPlayer();
    const resultado = await axe(container);
    const serias = resultado.violations
      .filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => `${v.id}: ${v.nodes.length} nó(s)`);
    expect(serias).toEqual([]);
  });

  it('a barra de posição é um slider com valores e atalhos de teclado', () => {
    const { container } = renderPlayer();
    const audio = container.querySelector('audio') as HTMLAudioElement;
    // jsdom não decodifica mídia: o áudio de verdade tem duração, então o teste
    // entrega a duração que o navegador entregaria no `loadedmetadata`.
    Object.defineProperty(audio, 'duration', { value: 120, configurable: true });
    fireEvent.loadedMetadata(audio);

    const barra = screen.getByRole('slider', { name: 'Posição do áudio' });
    expect(barra).toHaveAttribute('aria-valuemin', '0');
    expect(barra).toHaveAttribute('aria-valuemax', '120');
    expect(barra).toHaveAttribute('aria-valuenow', '0');
    expect(barra).toHaveAttribute('aria-valuetext', '0:00 de 2:00');
    expect(barra).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(barra, { key: 'ArrowRight' });
    expect(audio.currentTime).toBe(5);
    fireEvent.keyDown(barra, { key: 'ArrowUp' });
    expect(audio.currentTime).toBe(10);
    fireEvent.keyDown(barra, { key: 'ArrowLeft' });
    expect(audio.currentTime).toBe(5);
    fireEvent.keyDown(barra, { key: 'ArrowDown' });
    expect(audio.currentTime).toBe(0);
    fireEvent.keyDown(barra, { key: 'End' });
    expect(audio.currentTime).toBe(120);
    fireEvent.keyDown(barra, { key: 'Home' });
    expect(audio.currentTime).toBe(0);
  });

  it('o selo "Falhou - Tentar novamente" é botão de verdade e chama a transcrição', async () => {
    renderPlayer({ transcriptionStatus: 'failed' });
    const selo = screen.getByRole('button', { name: 'Falhou - Tentar novamente' });
    expect(selo.tagName).toBe('BUTTON');
    fireEvent.click(selo);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
  });

  it('o status da transcrição é anunciado (role="status")', () => {
    renderPlayer({ transcriptionStatus: 'processing' });
    expect(screen.getByRole('status')).toHaveTextContent('Transcrevendo...');
  });

  it('com movimento normal o waveform pulsa enquanto a bolha toca', () => {
    const { container } = renderPlayer();
    fireEvent.play(container.querySelector('audio') as HTMLAudioElement);
    const repetições = Array.from(container.querySelectorAll('[data-repeat]')).map((n) => n.getAttribute('data-repeat'));
    expect(repetições).toHaveLength(30);
    expect(repetições).toContain('Infinity');
  });

  it('com "reduzir movimento" o waveform não pede animação infinita', () => {
    definirReduzirMovimento(true);
    const { container } = renderPlayer();
    fireEvent.play(container.querySelector('audio') as HTMLAudioElement);
    const repetições = Array.from(container.querySelectorAll('[data-repeat]')).map((n) => n.getAttribute('data-repeat'));
    expect(repetições).toHaveLength(30);
    expect(repetições.every((r) => r === '0')).toBe(true);
  });
});
