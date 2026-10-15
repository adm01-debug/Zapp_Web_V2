/**
 * Acessibilidade — reduzir movimento (`prefers-reduced-motion: reduce`).
 *
 * Contrato: com o movimento reduzido ligado, os efeitos de gamificação
 * (`AnimatedBadge`, `StatCardWithGamification`, `LevelProgress`) param de
 * animar — sem brilho deslizante, sem pulso, sem entrada deslocada e com a
 * barra de nível já na largura final no primeiro paint.
 *
 * A preferência vem do `window.matchMedia` SIMULADO abaixo; o hook
 * `useReducedMotion` do framer-motion (o mesmo que o app usa) é trocado por uma
 * leitura desse matchMedia.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Zap } from 'lucide-react';
import { AnimatedBadge, StatCardWithGamification, LevelProgress } from '../GamificationEffects';

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

beforeEach(() => {
  preferenciaReduzida = false;
  simularMatchMedia();
});

describe('AnimatedBadge — reduzir movimento', () => {
  it('sem reduzir movimento roda o brilho e o pulso', () => {
    render(<AnimatedBadge value={42} variant="xp" />);

    expect(screen.getByTestId('badge-shimmer')).not.toBeNull();
    expect(screen.getByTestId('badge-pulse')).not.toBeNull();
  });

  it('com reduzir movimento nenhum efeito animado é montado', () => {
    preferenciaReduzida = true;
    render(<AnimatedBadge value={42} variant="xp" />);

    expect(screen.queryByTestId('badge-shimmer')).toBeNull();
    expect(screen.queryByTestId('badge-pulse')).toBeNull();

    const badge = screen.getByTestId('animated-badge') as HTMLElement;
    expect(badge.style.opacity).not.toBe('0');
    expect(badge.style.transform).not.toContain('scale');
    // o valor continua visível — só a animação foi pulada
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});

describe('LevelProgress — reduzir movimento', () => {
  it('com reduzir movimento a barra já vem na largura final e sem brilho', () => {
    preferenciaReduzida = true;
    render(<LevelProgress currentXP={50} requiredXP={100} level={2} />);

    expect(screen.queryByTestId('level-shimmer')).toBeNull();
    const fill = screen.getByTestId('level-progress-fill') as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });

  it('sem reduzir movimento a barra começa zerada e o brilho aparece', () => {
    render(<LevelProgress currentXP={50} requiredXP={100} level={2} />);

    expect(screen.getByTestId('level-shimmer')).not.toBeNull();
    const fill = screen.getByTestId('level-progress-fill') as HTMLElement;
    expect(fill.style.width).toBe('0px');
  });
});

describe('StatCardWithGamification — reduzir movimento', () => {
  it('com reduzir movimento o cartão já entra no lugar', () => {
    preferenciaReduzida = true;
    render(
      <StatCardWithGamification
        title="XP"
        value={10}
        change="+1"
        changeType="positive"
        icon={Zap}
        gradient="primary"
        index={0}
      />,
    );

    const card = screen.getByTestId('stat-card') as HTMLElement;
    expect(card.style.opacity).not.toBe('0');
    expect(card.style.transform).not.toContain('translate');
    expect(screen.getByText('XP')).toBeInTheDocument();
  });
});
