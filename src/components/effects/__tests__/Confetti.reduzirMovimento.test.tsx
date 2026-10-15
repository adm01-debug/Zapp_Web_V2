/**
 * Acessibilidade — reduzir movimento (`prefers-reduced-motion: reduce`).
 *
 * Contrato: com o movimento reduzido ligado, nem `Confetti` nem
 * `CelebrationOverlay` animam nada — nenhuma partícula é montada, nenhum brilho
 * nem faísca é criado, e o conteúdo aparece no primeiro paint (sem `initial`
 * deslocando).
 *
 * A preferência vem do `window.matchMedia` SIMULADO abaixo; o hook
 * `useReducedMotion` do framer-motion (o mesmo que o app usa) é trocado por uma
 * leitura desse matchMedia, e o resto do framer-motion segue real — então as
 * asserções são sobre o DOM que ele de fato produz.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Confetti, CelebrationOverlay } from '../Confetti';

let preferenciaReduzida = false;

function simularMatchMedia() {
  window.matchMedia = ((query: string) => ({
    matches: preferenciaReduzida && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return {
    ...actual,
    useReducedMotion: () =>
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
});

vi.mock('@/lib/secureRandom', () => ({ secureRandomFloat: () => 0.5 }));

beforeEach(() => {
  preferenciaReduzida = false;
  simularMatchMedia();
});

describe('Confetti — reduzir movimento', () => {
  it('com reduzir movimento não monta a camada de confete', () => {
    preferenciaReduzida = true;
    render(<Confetti isActive />);
    expect(screen.queryByTestId('confetti-layer')).toBeNull();
  });

  it('sem reduzir movimento a camada de confete aparece', () => {
    render(<Confetti isActive particleCount={3} />);
    expect(screen.getByTestId('confetti-layer')).not.toBeNull();
    expect(screen.queryAllByTestId('confetti-particle')).toHaveLength(3);
  });
});

describe('CelebrationOverlay — reduzir movimento', () => {
  it('mostra a mensagem e nenhum efeito animado', () => {
    preferenciaReduzida = true;
    render(<CelebrationOverlay isActive title="Meta Alcançada!" subtitle="Parabéns" />);

    expect(screen.getByText('Meta Alcançada!')).toBeInTheDocument();
    expect(screen.getByText('Parabéns')).toBeInTheDocument();
    expect(screen.queryByTestId('confetti-layer')).toBeNull();
    expect(screen.queryByTestId('celebration-glow')).toBeNull();
    expect(screen.queryAllByTestId('celebration-sparkle')).toHaveLength(0);

    const overlay = screen.getByTestId('celebration-overlay') as HTMLElement;
    expect(overlay.style.opacity).not.toBe('0');
    expect(overlay.style.transform).not.toContain('scale');
  });

  it('sem reduzir movimento monta confete, brilho e as 8 faíscas', () => {
    render(<CelebrationOverlay isActive title="Meta Alcançada!" subtitle="Parabéns" />);

    expect(screen.getByTestId('confetti-layer')).not.toBeNull();
    expect(screen.getByTestId('celebration-glow')).not.toBeNull();
    expect(screen.queryAllByTestId('celebration-sparkle')).toHaveLength(8);
  });
});
