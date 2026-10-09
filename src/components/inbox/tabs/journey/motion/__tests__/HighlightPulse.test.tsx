/**
 * J05 — `HighlightPulse`: realce de CHEGADA no episódio aberto pelo clique.
 * Pulso de 1,5 s e some; com "reduzir movimento" é um destaque estático que some
 * no mesmo prazo; em qualquer caso `onDone` avisa o fim.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { HighlightPulse } from '../HighlightPulse';

const reduce = vi.hoisted(() => ({ value: false }));

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => reduce.value,
}));

beforeEach(() => {
  reduce.value = false;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('J05 HighlightPulse', () => {
  it('(1) inativo: nada na tela e nenhum aviso de fim', () => {
    const onDone = vi.fn();
    render(<HighlightPulse active={false} onDone={onDone} />);

    expect(screen.queryByTestId('highlight-pulse')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDone).not.toHaveBeenCalled();
  });

  it('(2) ativo: pulsa por 1,5 s, avisa o fim e some', () => {
    const onDone = vi.fn();
    render(<HighlightPulse active onDone={onDone} token="success" />);

    const anel = screen.getByTestId('highlight-pulse');
    // primeiro quadro do pulso: transparente (é a animação que traz o brilho)
    expect(anel.style.opacity).toBe('0');
    expect(anel).toHaveAttribute('aria-hidden', 'true');
    expect(anel.className).toContain('success');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByTestId('highlight-pulse')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('highlight-pulse')).toBeNull();
  });

  it('(3) com reduzir movimento: destaque estático pelo mesmo 1,5 s e some', () => {
    reduce.value = true;
    const onDone = vi.fn();
    render(<HighlightPulse active onDone={onDone} token="info" />);

    const anel = screen.getByTestId('highlight-pulse');
    expect(anel.style.opacity).not.toBe('0'); // estático, sem pulso
    expect(anel.className).toContain('info');

    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(onDone).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('highlight-pulse')).toBeNull();
  });

  it('(4) um novo clique no mesmo episódio realça de novo', () => {
    const onDone = vi.fn();
    const { rerender } = render(<HighlightPulse active onDone={onDone} />);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByTestId('highlight-pulse')).toBeNull();

    rerender(<HighlightPulse active={false} onDone={onDone} />);
    expect(screen.queryByTestId('highlight-pulse')).toBeNull();

    rerender(<HighlightPulse active onDone={onDone} />);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByTestId('highlight-pulse')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(onDone).toHaveBeenCalledTimes(2);
  });
});
