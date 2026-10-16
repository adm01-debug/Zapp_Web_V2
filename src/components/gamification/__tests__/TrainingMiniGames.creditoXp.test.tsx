import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PB-18/D4: o cliente não é autoridade para conceder XP. A proposta antiga
// R2-AUTH-043 pressupunha uma RPC que não faz parte do contrato atual.
// Jogamos os diálogos reais e exigimos pontuação local, sem crédito fictício.
const { creditMock, toastMock, onXPEarnedMock } = vi.hoisted(() => ({
  creditMock: vi.fn(), toastMock: vi.fn(), onXPEarnedMock: vi.fn(),
}));
vi.mock('@/hooks/gamification/useAgentGamification', () => ({
  useAgentGamification: () => ({ creditMiniGameXp: creditMock }),
}));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: toastMock }));
vi.mock('@/lib/secureRandom', () => ({ secureRandomFloat: () => 0.01 }));

import { TrainingMiniGames } from '../TrainingMiniGames';
import { QUIZ_QUESTIONS, TYPING_PHRASES } from '../miniGamesData';

async function jogarQuizInteiro(acertar = true) {
  fireEvent.click(screen.getByRole('button', { name: /Quiz do Atendimento/ }));
  for (const questao of QUIZ_QUESTIONS) {
    const alvo = questao.options[acertar ? questao.correct : (questao.correct + 1) % questao.options.length];
    const alternativa = screen.getAllByRole('button').find(button => button.textContent === alvo);
    if (!alternativa) throw new Error('Alternativa não encontrada: ' + questao.question);
    fireEvent.click(alternativa);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  }
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

function expectNoCredit() {
  expect(creditMock).not.toHaveBeenCalled();
  expect(onXPEarnedMock).not.toHaveBeenCalled();
  for (const [toast] of toastMock.mock.calls) {
    expect(String(toast.description)).not.toMatch(/ganhou\s+\d+\s*XP/i);
  }
}

describe('TrainingMiniGames — PB-18/D4: pontuação sem crédito de XP', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks(); localStorage.clear();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('quiz completo guarda pontos e nunca chama crédito do cliente', async () => {
    render(<TrainingMiniGames onXPEarned={onXPEarnedMock} />);
    await jogarQuizInteiro();
    expectNoCredit();
    expect(JSON.parse(localStorage.getItem('miniGameHighScores')!)).toMatchObject({ quiz: 100 });
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining('100 pontos') }));
  });

  it('zero acertos não inventa recorde nem ganho', async () => {
    render(<TrainingMiniGames onXPEarned={onXPEarnedMock} />);
    await jogarQuizInteiro(false);
    expectNoCredit();
    expect(localStorage.getItem('miniGameHighScores')).toBeNull();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining('0 pontos') }));
  });

  it('cartões informam treinamento sem XP, nunca recompensa fictícia', () => {
    render(<TrainingMiniGames />);
    expect(screen.getAllByText('Recorde pessoal · sem XP').length).toBeGreaterThan(0);
    expect(screen.queryByText(/\d+ XP/)).toBeNull();
  });

  it('recorde anterior maior não é sobrescrito por resultado inferior', async () => {
    localStorage.setItem('miniGameHighScores', JSON.stringify({ quiz: 200 }));
    render(<TrainingMiniGames onXPEarned={onXPEarnedMock} />);
    await jogarQuizInteiro();
    expect(JSON.parse(localStorage.getItem('miniGameHighScores')!).quiz).toBe(200);
    expectNoCredit();
  });

  it('storage corrompido não derruba os jogos', () => {
    localStorage.setItem('miniGameHighScores', '{invalido');
    render(<TrainingMiniGames />);
    expect(screen.getByRole('button', { name: /Quiz do Atendimento/ })).toBeInTheDocument();
    expectNoCredit();
  });

  it('conclusão repetida do Speed Typing gera um aviso único, sem crédito', async () => {
    render(<TrainingMiniGames onXPEarned={onXPEarnedMock} />);
    fireEvent.click(screen.getByRole('button', { name: /Speed Typing/ }));
    fireEvent.change(screen.getByPlaceholderText('Digite aqui...'), { target: { value: TYPING_PHRASES[0] } });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expectNoCredit();
    expect(toastMock.mock.calls.filter(([toast]) => /Completo/.test(String(toast.title)))).toHaveLength(1);
  });
});
