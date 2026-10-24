import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * A tela de voz precisa explicar o silêncio: quando o navegador recusa o `play()`
 * (Safari/iOS) ou o TTS falha, o operador tem que ver o aviso em pt-BR e o toque
 * que tenta de novo — antes o overlay não dizia nada.
 *
 * Estes casos renderizam o componente REAL (`VoiceSearchOverlay`), só trocando o
 * `motion` do framer-motion por tags nativas para o DOM ser inspecionável.
 */
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  const make = (tag: string) =>
      React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
        const {
          initial: _initial, animate: _animate, exit: _exit, transition: _transition,
          variants: _variants, whileHover: _whileHover, whileTap: _whileTap, ...rest
        } = props;
        return React.createElement(tag, { ...rest, ref });
      });
  return {
    ...actual,

    motion: new Proxy({} as Record<string, unknown>, { get: (_alvo, tag: string) => make(tag) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useReducedMotion: () => true,
  };
});

import { VoiceSearchOverlay } from '../VoiceSearchOverlay';

function renderOverlay(props: Partial<React.ComponentProps<typeof VoiceSearchOverlay>> = {}) {
  const onRetrySpeak = vi.fn();
  render(
    <VoiceSearchOverlay
      isOpen
      phase="idle"
      partialTranscript=""
      finalTranscript="quais conversas não lidas"
      agentResponse="Você tem 3 conversas não lidas."
      error=""
      onRetrySpeak={onRetrySpeak}
      onClose={vi.fn()}
      onStartListening={vi.fn().mockResolvedValue(undefined)}
      onStopListening={vi.fn()}
      onStopSpeaking={vi.fn()}
      {...props}
    />
  );
  return { onRetrySpeak };
}

describe('aviso de resposta falada no assistente de voz', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('autoplay recusado mostra o motivo e a ação "Tocar resposta"', () => {
    const { onRetrySpeak } = renderOverlay({ ttsIssue: 'autoplay-blocked' });

    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('o navegador bloqueou o áudio');

    fireEvent.click(screen.getByRole('button', { name: 'Tocar resposta' }));
    expect(onRetrySpeak).toHaveBeenCalledTimes(1);
  });

  it('falha do TTS mostra o motivo e a ação "Tentar de novo"', () => {
    const { onRetrySpeak } = renderOverlay({ ttsIssue: 'playback-failed' });

    expect(screen.getByRole('alert').textContent).toContain('Não foi possível tocar a resposta em voz');

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetrySpeak).toHaveBeenCalledTimes(1);
  });

  it('sem falha de áudio não existe aviso na tela', () => {
    renderOverlay({ ttsIssue: '' });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tocar resposta' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
  });
});
