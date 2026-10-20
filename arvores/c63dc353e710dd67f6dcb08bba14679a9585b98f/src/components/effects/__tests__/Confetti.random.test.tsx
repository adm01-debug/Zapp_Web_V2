import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O Confetti tambem sorteia item por indice ao montar cada particula:
 *   color: COLORS[Math.floor(aleatorio * COLORS.length)]
 *   type:  ['confetti','star','circle'][Math.floor(aleatorio * 3)]
 *
 * Aqui a fonte de aleatoriedade e fixada para provar que o indice sorteado
 * escolhe a cor/tipo renderizados — e que o valor morre no estilo/animacao
 * (nao ha persistencia, regex nem envio ao banco nestes atributos).
 */
vi.mock('@/lib/secureRandom', () => ({
  secureRandomFloat: vi.fn(),
}));

import { secureRandomFloat } from '@/lib/secureRandom';
import { Confetti } from '../Confetti';

const mockFloat = vi.mocked(secureRandomFloat);

/** Normaliza uma cor do mesmo jeito que o jsdom faz (hsl(...) -> rgb(...)). */
function corNormalizada(cor: string): string {
  const el = document.createElement('div');
  el.style.backgroundColor = cor;
  return el.style.backgroundColor;
}

describe('Confetti — cor/tipo sorteados por indice', () => {
  beforeEach(() => {
    mockFloat.mockReset();
  });

  it('aleatorio ~1 escolhe o ULTIMO tipo (circle) e a ULTIMA cor', () => {
    mockFloat.mockReturnValue(0.99);
    render(<Confetti isActive particleCount={1} />);
    expect(mockFloat).toHaveBeenCalled();
    // floor(0.99 * 3) = 2 -> 'circle' renderiza um div rounded-full
    const circulo = document.querySelector('div.rounded-full');
    expect(circulo).not.toBeNull();
    // floor(0.99 * 7) = 6 -> ultima COLORS: pink hsl(340 82% 52%)
    expect((circulo as HTMLElement).style.backgroundColor).toBe(corNormalizada('hsl(340 82% 52%)'));
  });

  it('aleatorio ~0 escolhe o PRIMEIRO tipo (confetti) e a PRIMEIRA cor', () => {
    mockFloat.mockReturnValue(0.01);
    render(<Confetti isActive particleCount={1} />);
    expect(mockFloat).toHaveBeenCalled();
    // floor(0.01 * 3) = 0 -> 'confetti' (clipPath), nunca rounded-full
    expect(document.querySelector('div.rounded-full')).toBeNull();
    const confete = document.querySelector('div[style*="clip-path"]') as HTMLElement | null;
    expect(confete).not.toBeNull();
    // floor(0.01 * 7) = 0 -> COLORS[0] = hsl(var(--primary))
    expect(confete?.style.backgroundColor).toBe(corNormalizada('hsl(var(--primary))'));
  });
});
