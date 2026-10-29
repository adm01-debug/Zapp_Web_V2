import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PB-18/D4 — mini-games sem promessa de XP e sem quebrar com armazenamento
 * corrompido.
 *
 * 1) Nenhum caminho do servidor credita XP por partida e o cliente não pode
 *    creditar XP: os cartões e o toast não podem anunciar "XP" como recompensa.
 *    O que a tela mantém é o RECORDE PESSOAL (`miniGameHighScores`, por game.id).
 * 2) `localStorage` é do usuário: JSON inválido, forma errada, cota/escrita
 *    bloqueada ou `getItem` lançando NÃO podem derrubar o widget.
 *
 * A prova monta a TELA REAL (`TrainingMiniGames`), a mesma que o dashboard
 * usa, e observa o DOM, o `localStorage` e o toast (mockado só para inspeção).
 */
vi.mock('@/lib/secureRandom', () => ({ secureRandomFloat: vi.fn(() => 0.01) }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

import { toast } from '@/hooks/ui/use-toast';
import { TrainingMiniGames } from '../TrainingMiniGames';
import { GAMES, TYPING_PHRASES } from '../miniGamesData';

const CHAVE = 'miniGameHighScores';
const FRASE = TYPING_PHRASES[0];
const mockToast = vi.mocked(toast);

function abreOTela() {
  return render(<TrainingMiniGames />);
}

describe('TrainingMiniGames — sem XP e armazenamento resistente', () => {
  beforeEach(() => {
    localStorage.clear();
    mockToast.mockClear();
  });

  it('não anuncia XP nos cartões nem no toast (só recorde pessoal)', () => {
    vi.useFakeTimers();
    abreOTela();

    // Nenhum "XP" na tela (nem "50 XP"/"30 XP"/"40 XP"/"25 XP" antigos)
    expect(screen.queryByText(/XP/)).toBeNull();
    expect(screen.queryByText(/50 XP|30 XP|40 XP|25 XP/)).toBeNull();

    // Joga uma partida até o fim e confere a mensagem do toast
    fireEvent.click(screen.getByText('Speed Typing'));
    fireEvent.change(screen.getByPlaceholderText('Digite aqui...'), { target: { value: FRASE } });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(mockToast).toHaveBeenCalled();
    const chamada = mockToast.mock.calls[mockToast.mock.calls.length - 1][0];
    expect(chamada.description).not.toMatch(/XP/i);

    vi.useRealTimers();
  });

  it('renderiza com JSON corrompido e o widget segue jogável', () => {
    localStorage.setItem(CHAVE, '{isto-não-é-json');
    abreOTela();

    // Os quatro jogos continuam na tela do dashboard
    for (const game of GAMES) expect(screen.getByText(game.name)).toBeTruthy();

    // E dá para abrir um jogo normalmente
    fireEvent.click(screen.getByText('Speed Typing'));
    expect(screen.getByPlaceholderText('Digite aqui...')).toBeTruthy();
  });

  it('ignora forma inválida (array, texto, valores não numéricos)', () => {
    localStorage.setItem(CHAVE, JSON.stringify(['recorde', 10]));
    const { unmount } = abreOTela();
    expect(screen.getByText('Speed Typing')).toBeTruthy();
    unmount();

    localStorage.setItem(CHAVE, JSON.stringify({ 'speed-typing': 'alto', quiz: -5, desconhecido: 99 }));
    abreOTela();
    // Nenhum recorde válido -> nenhum troféu numérico vaza
    expect(screen.queryByText('99')).toBeNull();
  });

  it('não quebra quando getItem lança (localStorage bloqueado)', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    try {
      abreOTela();
      for (const game of GAMES) expect(screen.getByText(game.name)).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it('não quebra quando setItem lança (escrita bloqueada)', () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cota', 'QuotaExceededError');
    });
    try {
      abreOTela();
      fireEvent.click(screen.getByText('Speed Typing'));
      fireEvent.change(screen.getByPlaceholderText('Digite aqui...'), { target: { value: FRASE } });
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      // Sem crash: a tela continua montada
      expect(screen.getByText('Quiz do Atendimento')).toBeTruthy();
    } finally {
      spy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('mantém e atualiza o recorde pessoal persistido', () => {
    localStorage.setItem(CHAVE, JSON.stringify({ 'speed-typing': 10 }));
    vi.useFakeTimers();
    abreOTela();

    // Recorde anterior (10) aparece como troféu
    expect(screen.getByText('10')).toBeTruthy();

    // Nova partida melhor -> novo recorde persistido, sem XP no toast
    fireEvent.click(screen.getByText('Speed Typing'));
    fireEvent.change(screen.getByPlaceholderText('Digite aqui...'), { target: { value: FRASE } });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? '{}');
    expect(salvo['speed-typing']).toBe(FRASE.length);
    const chamada = mockToast.mock.calls[mockToast.mock.calls.length - 1][0];
    expect(chamada.description).toMatch(/Novo recorde/);
    expect(chamada.description).not.toMatch(/XP/i);

    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
