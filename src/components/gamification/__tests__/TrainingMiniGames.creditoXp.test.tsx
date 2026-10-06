import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * R2-AUTH-043 — o widget mostra o XP de cada mini-game (`game.xpReward`) e a
 * conclusão anunciava "Você ganhou N XP" sem nenhum consumidor que creditasse
 * a recompensa: `onXPEarned` é opcional e o único consumidor produtivo
 * (`DashboardWidgetRenderer`) monta `<TrainingMiniGames />` sem essa prop.
 *
 * Aqui o componente REAL é renderizado e o jogo é jogado de verdade (cliques
 * nas opções do quiz / digitação no Speed Typing). O que se mede:
 *  1. a conclusão credita no servidor o MESMO XP que o cartão anuncia;
 *  2. o texto de sucesso só aparece depois de o crédito confirmar;
 *  3. crédito que falha aparece como falha (nunca como ganho);
 *  4. conclusão repetida do mesmo jogo credita uma única vez.
 */

const { addXpMock, toastMock } = vi.hoisted(() => ({
  addXpMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('@/hooks/gamification/useAgentGamification', () => ({
  useAgentGamification: () => ({ addXp: addXpMock }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: toastMock }));

// Frase sorteada fixada na PRIMEIRA do catálogo (o Speed Typing digita ela).
vi.mock('@/lib/secureRandom', () => ({ secureRandomFloat: () => 0.01 }));

import { TrainingMiniGames } from '../TrainingMiniGames';
import { GAMES, QUIZ_QUESTIONS, TYPING_PHRASES } from '../miniGamesData';

type ToastArgs = { title?: unknown; description?: unknown; variant?: string };

const toasts = (): ToastArgs[] =>
  (toastMock.mock.calls as unknown as [ToastArgs][]).map(([t]) => t);

/** Toast de sucesso do jogo (o que anuncia o XP ganho). */
const toastDeSucesso = (): ToastArgs | undefined =>
  toasts().find((t) => typeof t.title === 'string' && /Completo/.test(t.title));

const toastDeFalha = (): ToastArgs | undefined =>
  toasts().find((t) => t.variant === 'destructive');

const xpDe = (id: (typeof GAMES)[number]['id']): number =>
  GAMES.find((g) => g.id === id)!.xpReward;

/** Joga o Quiz inteiro (5 perguntas) respondendo sempre a alternativa correta. */
async function jogarQuizInteiro(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /Quiz do Atendimento/ }));
  for (const questao of QUIZ_QUESTIONS) {
    const alternativa = screen
      .getAllByRole('button')
      .find((b) => b.textContent === questao.options[questao.correct]);
    if (!alternativa) throw new Error(`alternativa correta não encontrada: ${questao.question}`);
    fireEvent.click(alternativa);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  }
}

const CREDITO_OK = { newXp: 130, newLevel: 3, previousLevel: 3, leveledUp: false };

describe('TrainingMiniGames — crédito do XP anunciado', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    addXpMock.mockReset();
    toastMock.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('credita no servidor o mesmo XP que o cartão do jogo anuncia', async () => {
    addXpMock.mockResolvedValue(CREDITO_OK);
    render(<TrainingMiniGames />);

    await jogarQuizInteiro();

    expect(addXpMock).toHaveBeenCalledTimes(1);
    expect(addXpMock).toHaveBeenCalledWith({
      xp: xpDe('quiz'),
      reason: expect.stringContaining('Quiz'),
    });
  });

  it('só anuncia o XP depois que o crédito confirma', async () => {
    let liberarCredito: (valor: unknown) => void = () => {};
    addXpMock.mockImplementation(
      () => new Promise((resolve) => { liberarCredito = resolve; }),
    );
    render(<TrainingMiniGames />);

    await jogarQuizInteiro();

    expect(addXpMock).toHaveBeenCalledTimes(1);
    expect(toastDeSucesso()).toBeUndefined();

    await act(async () => {
      liberarCredito(CREDITO_OK);
      await vi.advanceTimersByTimeAsync(0);
    });

    const sucesso = toastDeSucesso();
    expect(sucesso).toBeDefined();
    expect(String(sucesso?.description)).toContain(`${xpDe('quiz')} XP`);
  });

  it('crédito que falha aparece como falha, nunca como ganho', async () => {
    addXpMock.mockRejectedValue(new Error('permission denied'));
    render(<TrainingMiniGames />);

    await jogarQuizInteiro();

    expect(addXpMock).toHaveBeenCalledTimes(1);
    expect(toastDeSucesso()).toBeUndefined();
    const falha = toastDeFalha();
    expect(falha).toBeDefined();
    expect(String(falha?.title)).toMatch(/não creditado/i);
  });

  it('conclusão repetida do mesmo jogo credita uma única vez', async () => {
    addXpMock.mockResolvedValue(CREDITO_OK);
    render(<TrainingMiniGames />);

    fireEvent.click(screen.getByRole('button', { name: /Speed Typing/ }));
    fireEvent.change(screen.getByPlaceholderText('Digite aqui...'), {
      target: { value: TYPING_PHRASES[0] },
    });
    // O cronômetro zera e a conclusão é publicada mais de uma vez (o efeito do
    // diálogo reexecuta a cada render); o crédito continua sendo um só.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(addXpMock).toHaveBeenCalledTimes(1);
    expect(addXpMock).toHaveBeenCalledWith({
      xp: xpDe('speed-typing'),
      reason: expect.stringContaining('Speed Typing'),
    });
  });
});
