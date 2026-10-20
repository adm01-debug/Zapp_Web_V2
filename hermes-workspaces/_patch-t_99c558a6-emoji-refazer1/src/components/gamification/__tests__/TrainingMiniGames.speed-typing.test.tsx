import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Item 268 / R2-AUTH-044 — "Speed Typing encerrado conclui o jogo seguinte e
 * grava seu recorde sem jogá-lo".
 *
 * Quem grava o recorde é `TrainingMiniGames` (a tela que o dashboard usa), em
 * `miniGameHighScores`, com a chave do `game.id` SELECIONADO no pai. O teste
 * monta a TELA REAL, joga o Speed Typing até o relógio zerar e então clica no
 * jogo seguinte: o Quiz tem de abrir na primeira pergunta e o recorde dele tem
 * de continuar vazio.
 */
vi.mock('@/lib/secureRandom', () => ({ secureRandomFloat: vi.fn(() => 0.01) }));

import { TrainingMiniGames } from '../TrainingMiniGames';
import { TYPING_PHRASES } from '../miniGamesData';

/** `secureRandomFloat` fixo em 0.01 -> índice 0 -> sempre a primeira frase. */
const FRASE = TYPING_PHRASES[0];

function recordes(): Record<string, number> {
  return JSON.parse(localStorage.getItem('miniGameHighScores') ?? '{}');
}

describe('TrainingMiniGames — fim do Speed Typing', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('não conclui nem grava o recorde do Quiz quando o Speed Typing termina', () => {
    render(<TrainingMiniGames />);

    // Abre o Speed Typing na tela real (a lista de mini-games do dashboard)
    fireEvent.click(screen.getByText('Speed Typing'));
    const campo = screen.getByPlaceholderText('Digite aqui...');

    // Joga: acerta a frase inteira -> placar = tamanho da frase
    fireEvent.change(campo, { target: { value: FRASE } });
    expect(screen.getByText(`${FRASE.length} pts`)).toBeTruthy();

    // O relógio de 60s zera: a partida acaba e o recorde do Speed Typing sai
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(recordes()['speed-typing']).toBe(FRASE.length);

    // Agora o usuário abre OUTRO jogo
    fireEvent.click(screen.getByText('Quiz do Atendimento'));

    // O Quiz tem de abrir na primeira pergunta...
    expect(screen.getByText(/Qual a primeira coisa a fazer ao receber uma reclamação/)).toBeTruthy();
    // ...e o recorde dele tem de continuar vazio (ninguém jogou o Quiz)
    expect(recordes().quiz).toBeUndefined();
  });

  it('ainda conclui e grava o recorde quando o Speed Typing é jogado de novo', () => {
    render(<TrainingMiniGames />);

    // 1ª partida: uma frase -> recorde 33
    fireEvent.click(screen.getByText('Speed Typing'));
    fireEvent.change(screen.getByPlaceholderText('Digite aqui...'), { target: { value: FRASE } });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(recordes()['speed-typing']).toBe(FRASE.length);

    // 2ª partida: duas frases -> recorde 66 (o jogo reabriu e voltou a contar)
    fireEvent.click(screen.getByText('Speed Typing'));
    const campo = screen.getByPlaceholderText('Digite aqui...');
    fireEvent.change(campo, { target: { value: FRASE } });
    fireEvent.change(campo, { target: { value: FRASE } });
    expect(screen.getByText(`${FRASE.length * 2} pts`)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(recordes()['speed-typing']).toBe(FRASE.length * 2);
  });
});
