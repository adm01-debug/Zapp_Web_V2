import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * As 6 chamadas de `Math.random()` de `CelebrationParticles` sorteiam apenas
 * x/y/delay/duration/size/cor de 20 particulas de enfeite: o valor morre no
 * estilo/animacao do `<motion.div>` — nao e gravado (nem localStorage nem
 * banco), nao e comparado por regex (`id` e o indice do `Array.from`) nem e
 * enviado ao servidor.
 *
 * O teste fixa a fonte de aleatoriedade para provar duas coisas: (a) o numero de
 * sorteios nao mudou (6 por particula x 20 particulas) e (b) o valor sorteado
 * continua decidindo o que aparece na tela.
 */
vi.mock('@/lib/secureRandom', () => ({
  secureRandomFloat: vi.fn(),
}));

import { secureRandomFloat } from '@/lib/secureRandom';
import { CelebrationParticles } from '../LeaderboardHelpers';

const mockFloat = vi.mocked(secureRandomFloat);

/** Particulas de verdade: as do enfeite tem largura inline; o wrapper nao. */
function particulas(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('div.absolute')).filter(
    (elemento) => elemento.style.width !== '',
  );
}

describe('CelebrationParticles — enfeite sorteado', () => {
  beforeEach(() => {
    mockFloat.mockReset();
  });

  it('tira os 6 valores de cada particula da fonte segura (6 x 20 = 120 sorteios)', () => {
    mockFloat.mockReturnValue(0.5);

    const { container } = render(<CelebrationParticles isVisible />);

    expect(mockFloat).toHaveBeenCalledTimes(6 * 20);
    expect(particulas(container)).toHaveLength(20);
  });

  it('o valor sorteado decide o tamanho da particula (4 + aleatorio * 8)', () => {
    mockFloat.mockReturnValue(0.5);

    const { container } = render(<CelebrationParticles isVisible />);

    // 4 + 0.5 * 8 = 8px
    for (const particula of particulas(container)) {
      expect(particula.style.width).toBe('8px');
      expect(particula.style.height).toBe('8px');
    }
  });

  it('nao renderiza particula nenhuma quando invisivel', () => {
    mockFloat.mockReturnValue(0.5);

    const { container } = render(<CelebrationParticles isVisible={false} />);

    expect(particulas(container)).toHaveLength(0);
  });
});
