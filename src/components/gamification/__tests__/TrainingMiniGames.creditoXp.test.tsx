import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PB-18/D4 (ADR-011) — o cliente NÃO credita XP de mini-game.
 *
 * O contrato anterior (R2-AUTH-043 / #267) fazia a tela creditar o `xpEarned` da
 * partida por `creditMiniGameXp`, com limite diário de 5 créditos. A decisão D4 tirou
 * as RPCs de XP do alcance de `authenticated` (o XP de verdade vem dos gatilhos de
 * servidor) e `useAgentGamification` deixou de expor o crédito. Os mesmos cenários
 * agora provam o contrato novo: o componente REAL é renderizado e o jogo é jogado de
 * verdade (cliques nas opções do quiz / digitação no Speed Typing), e o que se mede é:
 *  A. a conclusão guarda os PONTOS da partida e nunca chama um crédito de XP;
 *  B. partida sem acertos não inventa recorde nem ganho;
 *  C. o cartão e o aviso nunca prometem XP (nem o `xpReward` antigo);
 *  D. o aviso de conclusão sai na hora, sem depender de crédito do servidor;
 *  E. um crédito que o hook ainda exponha (e falhe) nunca é consultado nem vira falha;
 *  F. conclusão repetida do mesmo jogo gera um único aviso.
 */

const { creditMock, toastMock, onXPEarnedMock } = vi.hoisted(() => ({
  creditMock: vi.fn(),
  toastMock: vi.fn(),
  onXPEarnedMock: vi.fn(),
}));

// Se a tela voltasse a consumir o hook de gamificação, o espião acusaria a chamada.
vi.mock('@/hooks/gamification/useAgentGamification', () => ({
  useAgentGamification: () => ({ creditMiniGameXp: creditMock }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: toastMock }));

// Frase sorteada fixada na PRIMEIRA do catálogo (o Speed Typing digita ela).
vi.mock('@/lib/secureRandom', () => ({ secureRandomFloat: () => 0.01 }));

import { TrainingMiniGames } from '../TrainingMiniGames';
import { QUIZ_QUESTIONS, TYPING_PHRASES } from '../miniGamesData';

type ToastArgs = { title?: unknown; description?: unknown; variant?: string };

const toasts = (): ToastArgs[] =>
  (toastMock.mock.calls as unknown as [ToastArgs][]).map(([t]) => t);

/** Toast de conclusão do jogo. */
const toastsDeConclusao = (): ToastArgs[] =>
  toasts().filter((t) => typeof t.title === 'string' && /Completo/.test(t.title));

/** Algum toast menciona XP (ganho, perda ou limite)? */
const algumToastFalaDeXp = (): boolean =>
  toasts().some(
    (t) =>
      /XP/i.test(String(t.title ?? '')) || /XP/i.test(String(t.description ?? '')),
  );

// Pontos do Quiz com TODAS as respostas certas: 20 por pergunta.
const PONTOS_QUIZ_COMPLETO = QUIZ_QUESTIONS.length * 20;

const recordes = (): Record<string, number> =>
  JSON.parse(localStorage.getItem('miniGameHighScores') ?? '{}');

/** Nada de crédito: nem chamada ao hook, nem callback de XP, nem toast que fale de XP. */
function esperaSemCreditoDeXp(): void {
  expect(creditMock).not.toHaveBeenCalled();
  expect(onXPEarnedMock).not.toHaveBeenCalled();
  expect(algumToastFalaDeXp()).toBe(false);
}

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

describe('TrainingMiniGames — PB-18/D4: pontuação sem crédito de XP', () => {
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

  it('(A) a conclusão guarda os pontos da partida e não credita XP', async () => {
    render(<TrainingMiniGames onXPEarned={onXPEarnedMock} />);

    await jogarQuizInteiro();

    esperaSemCreditoDeXp();
    expect(recordes()).toMatchObject({ quiz: PONTOS_QUIZ_COMPLETO });
    const conclusao = toastsDeConclusao();
    expect(conclusao).toHaveLength(1);
    expect(String(conclusao[0].description)).toContain(`${PONTOS_QUIZ_COMPLETO} pontos`);
  });

  it('(B) quiz com 0 acertos não inventa recorde nem ganho', async () => {
    render(<TrainingMiniGames onXPEarned={onXPEarnedMock} />);

    await jogarQuizInteiro(false);

    esperaSemCreditoDeXp();
    expect(localStorage.getItem('miniGameHighScores')).toBeNull();
    expect(String(toastsDeConclusao()[0].description)).toContain('0 pontos');
  });

  it('(C) os cartões não prometem XP e o recorde anterior maior não é sobrescrito', async () => {
    localStorage.setItem('miniGameHighScores', JSON.stringify({ quiz: 200 }));
    render(<TrainingMiniGames onXPEarned={onXPEarnedMock} />);

    expect(screen.queryByText(/XP/)).toBeNull();

    await jogarQuizInteiro();

    esperaSemCreditoDeXp();
    expect(recordes().quiz).toBe(200);
  });

  it('(D) o aviso de conclusão sai sem esperar crédito algum do servidor', async () => {
    // Mesmo que um crédito pendente existisse, a tela não o consulta nem espera por ele.
    creditMock.mockImplementation(() => new Promise(() => {}));
    render(<TrainingMiniGames onXPEarned={onXPEarnedMock} />);

    await jogarQuizInteiro();

    expect(toastsDeConclusao()).toHaveLength(1);
    esperaSemCreditoDeXp();
  });

  it('(E) crédito que falharia não aparece como falha: a tela nem o chama', async () => {
    creditMock.mockRejectedValue(new Error('permission denied'));
    render(<TrainingMiniGames onXPEarned={onXPEarnedMock} />);

    await jogarQuizInteiro();

    esperaSemCreditoDeXp();
    expect(toasts().find((t) => t.variant === 'destructive')).toBeUndefined();
    expect(toastsDeConclusao()).toHaveLength(1);
  });

  it('(F) conclusão repetida do mesmo jogo gera um único aviso, sem crédito', async () => {
    render(<TrainingMiniGames onXPEarned={onXPEarnedMock} />);

    fireEvent.click(screen.getByRole('button', { name: /Speed Typing/ }));
    fireEvent.change(screen.getByPlaceholderText('Digite aqui...'), {
      target: { value: TYPING_PHRASES[0] },
    });
    // O cronômetro zera e a conclusão é publicada mais de uma vez (o efeito do
    // diálogo reexecuta a cada render); o aviso continua sendo um só.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    esperaSemCreditoDeXp();
    expect(toastsDeConclusao()).toHaveLength(1);
    expect(recordes()['speed-typing']).toBe(TYPING_PHRASES[0].length);
  });
});
