/**
 * CV-032 — Testes de componente BrindeMeter.
 * CV-033 — Testes do MissingQuestions.
 * CV-040 — InsightCard sem sources mostra "(justificativa não disponível)".
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrindeMeter } from '../BrindeMeter';
import { MissingQuestions } from '../MissingQuestions';
import { InsightCard } from '../InsightCard';
import { getMissingLetters } from '@/data/copilot/brinde-questions';

const fullState = { B: 'R$ 5.000', R: 'Maria', I: 'natal', N: '100', D: '2026-11-20', E: 'SP' };
const emptyState = { B: null, R: null, I: null, N: null, D: null, E: null };
const partialState = { ...emptyState, B: 'R$ 5.000', I: 'natal' };

describe('BrindeMeter CV-032', () => {
  it('renderiza 6 casinhas', () => {
    render(<BrindeMeter state={emptyState} />);
    expect(screen.getAllByRole('button')).toHaveLength(6);
  });

  it('chama onLetterClick com a letra e msgId corretos', async () => {
    const handler = vi.fn();
    const evidence = { B: 'msg-001', R: null, I: null, N: null, D: null, E: null };
    render(<BrindeMeter state={partialState} evidence={evidence} onLetterClick={handler} />);
    const buttons = screen.getAllByRole('button');
    await userEvent.click(buttons[0]);
    expect(handler).toHaveBeenCalledWith('B', 'msg-001');
  });
});

describe('MissingQuestions CV-033', () => {
  it('nao renderiza quando todas as letras estao preenchidas', () => {
    const { container } = render(
      <MissingQuestions brinde_state={fullState} stage="E2" onSelectQuestion={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('sugere perguntas para letras ausentes', () => {
    render(
      <MissingQuestions brinde_state={partialState} stage="E2" onSelectQuestion={() => {}} />,
    );
    expect(screen.queryByText(/O que falta perguntar/i)).toBeTruthy();
  });

  it('chama onSelectQuestion ao clicar', async () => {
    const handler = vi.fn();
    render(
      <MissingQuestions brinde_state={partialState} stage="E2" onSelectQuestion={handler} />,
    );
    const buttons = screen.getAllByRole('button');
    await userEvent.click(buttons[0]);
    expect(handler).toHaveBeenCalledWith(expect.any(String));
  });
});

describe('getMissingLetters', () => {
  it('retorna lista vazia quando todas preenchidas', () => {
    expect(getMissingLetters(fullState)).toHaveLength(0);
  });

  it('retorna 6 letras quando estado vazio', () => {
    expect(getMissingLetters(emptyState)).toHaveLength(6);
  });

  it('retorna so as letras ausentes', () => {
    const missing = getMissingLetters(partialState);
    expect(missing).not.toContain('B');
    expect(missing).not.toContain('I');
    expect(missing).toContain('R');
  });
});

describe('InsightCard CV-040', () => {
  it('exibe aviso quando sources vazio', () => {
    render(<InsightCard type="suggestion" content="Envie a proposta." sources={[]} />);
    expect(screen.getByText(/justificativa não disponível/i)).toBeTruthy();
  });

  it('exibe botao de justificativa quando ha sources', () => {
    render(
      <InsightCard
        type="next_action"
        content="Pergunte o orcamento."
        sources={[{ text: 'Cliente mencionou natal', letter: 'I' }]}
      />,
    );
    expect(screen.getByText(/Por que estou sugerindo/i)).toBeTruthy();
  });
});
