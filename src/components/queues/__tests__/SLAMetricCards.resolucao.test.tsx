/**
 * Prova da TELA: o card “Resolução” existe e mostra o que o hook entrega.
 *
 * Renderiza o SLAMetricCards REAL (sem mock de child) com uma amostra sintética
 * de resolução e confere a saída. A taxa é 75% — no limiar de atenção — de
 * propósito: prova que o número sai formatado e que o card não exibe a
 * contagem errada de “no prazo”.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SLAMetricCards } from '../SLAMetricCards';

const data = {
  overallRate: 92.5,
  totalConversations: 50,
  firstResponse: { rate: 88, onTime: 40, breached: 5 },
  resolution: { rate: 75, onTime: 9, breached: 3, total: 12 },
};

function renderCards(sparkRes: number[] = []) {
  return render(
    <SLAMetricCards
      data={data}
      periodLabel="Hoje"
      sparkOverall={[90, 92, 95]}
      sparkFR={[80, 85, 88]}
      sparkRes={sparkRes}
      sparkConversations={[10, 20, 50]}
    />
  );
}

describe('SLAMetricCards — card de Resolução', () => {
  it('mostra o card de Resolução com a taxa formatada', () => {
    renderCards();

    const titulo = screen.getByText('Resolução');
    expect(titulo).toBeInTheDocument();
    // A taxa do card de resolução (75.0%) — diferente da geral (92.5%) e da 1ª resposta (88.0%).
    expect(screen.getByText('75.0%')).toBeInTheDocument();
  });

  it('mostra as contagens de resolução, não as da 1ª resposta', () => {
    renderCards();

    expect(screen.getByText('9 no prazo')).toBeInTheDocument();
    expect(screen.getByText('3 atrasados')).toBeInTheDocument();
    // As da 1ª resposta continuam no card próprio (40 / 5).
    expect(screen.getByText('40 no prazo')).toBeInTheDocument();
    expect(screen.getByText('5 atrasados')).toBeInTheDocument();
  });

  it('com série (sparkRes) ainda renderiza o card — garantia de paridade de props', () => {
    renderCards([70, 72, 75]);
    expect(screen.getByText('Resolução')).toBeInTheDocument();
  });
});
