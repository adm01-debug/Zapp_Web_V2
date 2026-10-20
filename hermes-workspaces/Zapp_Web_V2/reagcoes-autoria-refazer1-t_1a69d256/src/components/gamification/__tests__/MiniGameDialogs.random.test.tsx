import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Sorteio de verdade do Speed Typing: a frase e escolhida por
 * `TYPING_PHRASES[Math.floor(aleatorio * TYPING_PHRASES.length)]`.
 *
 * Este teste fixa a fonte de aleatoriedade (`secureRandomFloat`) para provar,
 * sem depender do azar, que o INDICE sorteado decide a frase renderizada —
 * exatamente o comportamento que a troca da fonte aleatoria global pela segura
 * precisa preservar. A frase sorteada morre na tela (render) e nao e gravada,
 * comparada por regex nem enviada ao banco (o que persiste, em
 * TrainingMiniGames.tsx, e o high score por `game.id`).
 */
vi.mock('@/lib/secureRandom', () => ({
  secureRandomFloat: vi.fn(),
}));

import { secureRandomFloat } from '@/lib/secureRandom';
import { SpeedTypingGame } from '../MiniGameDialogs';
import { TYPING_PHRASES } from '../miniGamesData';

const mockFloat = vi.mocked(secureRandomFloat);

/** Frase que de fato aparece no DOM (as letras sao renderizadas em <span>). */
function fraseNoDom(): string | undefined {
  return TYPING_PHRASES.find((frase) => document.body.textContent?.includes(frase));
}

function renderizarSpeedTyping() {
  return render(<SpeedTypingGame isOpen onClose={() => {}} onComplete={() => {}} />);
}

describe('SpeedTypingGame — sorteio da frase', () => {
  beforeEach(() => {
    mockFloat.mockReset();
  });

  it('tira a frase inicial da fonte segura (nao da global)', () => {
    mockFloat.mockReturnValue(0.01);
    renderizarSpeedTyping();
    expect(mockFloat).toHaveBeenCalled();
  });

  it('indice 0 (aleatorio ~0) escolhe a PRIMEIRA frase', () => {
    mockFloat.mockReturnValue(0.01);
    renderizarSpeedTyping();
    expect(fraseNoDom()).toBe(TYPING_PHRASES[0]);
  });

  it('indice maximo (aleatorio ~1) escolhe a ULTIMA frase', () => {
    mockFloat.mockReturnValue(0.99);
    renderizarSpeedTyping();
    expect(fraseNoDom()).toBe(TYPING_PHRASES[TYPING_PHRASES.length - 1]);
  });
});
