import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * R2-AUTH-043 / #267 — o widget mostra o XP de cada mini-game (`game.xpReward`),
 * mas o crédito real é o XP que a partida rendeu (`xpEarned`, vindo de
 * `onComplete(score, xp)` do diálogo), com limite de 5 créditos por dia por
 * agente e mini-game imposto no servidor (`credit_agent_mini_game_xp`).
 *
 * Aqui o componente REAL é renderizado e o jogo é jogado de verdade (cliques
 * nas opções do quiz / digitação no Speed Typing). O que se mede:
 *  A. a conclusão credita o xpEarned da partida, NUNCA o xpReward do cartão;
 *  B. partida com 0 XP não chama o crédito e não anuncia ganho;
 *  C. limite diário recusado pelo servidor não anuncia ganho;
 *  D. o texto de sucesso só aparece depois de o crédito confirmar;
 *  E. crédito que falha aparece como falha (nunca como ganho);
 *  F. conclusão repetida da mesma partida credita uma única vez.
 */

const { creditMock, toastMock, onXPEarnedMock } = vi.hoisted(() => ({
  creditMock: vi.fn(),
  toastMock: vi.fn(),
  onXPEarnedMock: vi.fn(),
}));

vi.mock('@/hooks/gamification/useAgentGamification', () => ({
  useAgentGamification: () => ({ creditMiniGameXp: creditMock }),
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

/** Algum toast anuncia ganho de XP? (só vale quando não há toast destructive) */
const algumToastAnunciaGanho = (): boolean =>
  toasts().some(
    (t) =>
      typeof t.description === 'string' &&
      (/ganhou\s+\d+ XP/.test(t.description) || /[1-9]\d*\s*XP/.test(t.description)),
  );

// XP que o Quiz realmente rende com TODAS as respostas certas: o diálogo manda
// floor((5 perguntas * 20 pts) / 3) = 33. 33 !== xpReward do cartão 'quiz' (30):
// é a prova de que o crédito usa o xpEarned da partida, não o xpReward do cartão.
const XP_QUIZ_COMPLETO = Math.floor((QUIZ_QUESTIONS.length * 20) / 3);
const XP_REWARD_QUIZ = GAMES.find((g) => g.id === 'quiz')!.xpReward;

const creditoOk = (xpCreditado: number) => ({
  credited: true,
  reason: 'ok' as const,
  partidas: 1,
  maxPartidasDia: 5,
  xpCreditado,
  newXp: 100 + xpCreditado,
  newLevel: 3,
  previousLevel: 3,
  leveledUp: false,
});

const LIMITE_DIARIO = {
  credited: false,
  reason: 'daily_limit' as const,
  partidas: 5,
  maxPartidasDia: 5,
  xpCreditado: 0,
};

/** Joga o Quiz inteiro (5 perguntas); acertar=false erra sempre a alternativa. */
async function jogarQuizInteiro(acertar = true): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /Quiz do Atendimento/ }));
  for (const questao of QUIZ_QUESTIONS) {
    const alvo = acertar
      ? questao.options[questao.correct]
      : questao.options[(questao.correct + 1) % questao.options.length];
    const alternativa = screen
      .getAllByRole('button')
      .find((b) => b.textContent === alvo);
    if (!alternativa) throw new Error(`alternativa não encontrada: ${questao.question}`);
    fireEvent.click(alternativa);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  }
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('TrainingMiniGames — crédito do XP ganho na partida', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    creditMock.mockReset();
    toastMock.mockReset();
    onXPEarnedMock.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('(A) credita o xpEarned da partida, não o xpReward do cartão', async () => {
    creditMock.mockResolvedValue(creditoOk(XP_QUIZ_COMPLETO));
    render(<TrainingMiniGames onXPEarned={onXPEarnedMock} />);

    await jogarQuizInteiro();

    expect(creditMock).toHaveBeenCalledTimes(1);
    expect(creditMock).toHaveBeenCalledWith({
      gameId: 'quiz',
      xp: XP_QUIZ_COMPLETO,
    });
    expect(XP_QUIZ_COMPLETO).not.toBe(XP_REWARD_QUIZ); // 33 !== 30
    expect(onXPEarnedMock).toHaveBeenCalledWith(XP_QUIZ_COMPLETO);
    expect(String(toastDeSucesso()?.description)).toContain(`${XP_QUIZ_COMPLETO} XP`);
    expect(String(toastDeSucesso()?.description)).not.toContain(`${XP_REWARD_QUIZ} XP`);
  });

  it('(B) quiz com 0 acertos não chama o crédito e não anuncia ganho', async () => {
    render(<TrainingMiniGames onXPEarned={onXPEarnedMock} />);

    await jogarQuizInteiro(false);

    expect(creditMock).not.toHaveBeenCalled();
    expect(onXPEarnedMock).not.toHaveBeenCalled();
    expect(algumToastAnunciaGanho()).toBe(false);
  });

  it('(C) limite diário recusado pelo servidor não anuncia ganho', async () => {
    creditMock.mockResolvedValue(LIMITE_DIARIO);
    render(<TrainingMiniGames onXPEarned={onXPEarnedMock} />);

    await jogarQuizInteiro();

    expect(creditMock).toHaveBeenCalledTimes(1);
    expect(onXPEarnedMock).not.toHaveBeenCalled();
    expect(algumToastAnunciaGanho()).toBe(false);
    const limite = toasts().find(
      (t) => typeof t.title === 'string' && /limite diário/i.test(t.title),
    );
    expect(limite).toBeDefined();
  });

  it('(D) só anuncia o XP depois que o crédito confirma', async () => {
    let liberarCredito: (valor: unknown) => void = () => {};
    creditMock.mockImplementation(
      () => new Promise((resolve) => { liberarCredito = resolve; }),
    );
    render(<TrainingMiniGames onXPEarned={onXPEarnedMock} />);

    await jogarQuizInteiro();

    expect(creditMock).toHaveBeenCalledTimes(1);
    expect(toastDeSucesso()).toBeUndefined();
    expect(onXPEarnedMock).not.toHaveBeenCalled();

    await act(async () => {
      liberarCredito(creditoOk(XP_QUIZ_COMPLETO));
      await vi.advanceTimersByTimeAsync(0);
    });

    const sucesso = toastDeSucesso();
    expect(sucesso).toBeDefined();
    expect(String(sucesso?.description)).toContain(`${XP_QUIZ_COMPLETO} XP`);
    expect(onXPEarnedMock).toHaveBeenCalledWith(XP_QUIZ_COMPLETO);
  });

  it('(E) crédito que falha aparece como falha, nunca como ganho', async () => {
    creditMock.mockRejectedValue(new Error('permission denied'));
    render(<TrainingMiniGames onXPEarned={onXPEarnedMock} />);

    await jogarQuizInteiro();

    expect(creditMock).toHaveBeenCalledTimes(1);
    expect(toastDeSucesso()).toBeUndefined();
    expect(onXPEarnedMock).not.toHaveBeenCalled();
    const falha = toastDeFalha();
    expect(falha).toBeDefined();
    expect(String(falha?.title)).toMatch(/não creditado/i);
  });

  it('(F) conclusão repetida do mesmo jogo credita uma única vez', async () => {
    creditMock.mockResolvedValue(creditoOk(Math.floor(TYPING_PHRASES[0].length / 2)));
    render(<TrainingMiniGames onXPEarned={onXPEarnedMock} />);

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

    expect(creditMock).toHaveBeenCalledTimes(1);
    expect(creditMock).toHaveBeenCalledWith({
      gameId: 'speed-typing',
      xp: Math.floor(TYPING_PHRASES[0].length / 2),
    });
  });
});
