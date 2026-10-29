/**
 * R2-SLA-001 — SEM AMOSTRA os cards de métrica não podem afirmar taxa.
 *
 * Antes: sem nenhuma 1ª resposta avaliada o card mostrava "0.0%" pintado de crítico
 * (vermelho), como se a operação tivesse falhado. Esta prova renderiza o componente
 * REAL e confere a saída nos dois temas (claro e escuro), porque a cor vem de token.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SLAMetricCards } from '../SLAMetricCards';

const base = { periodLabel: 'Hoje', sparkOverall: [], sparkFR: [], sparkConversations: [] };

function renderizar(hasSample: boolean, overallRate: number) {
  render(
    <SLAMetricCards
      {...base}
      data={{
        overallRate,
        totalConversations: 9,
        hasSample,
        firstResponse: { rate: overallRate, onTime: 0, breached: 0 },
      }}
    />,
  );
}

afterEach(() => document.documentElement.classList.remove('dark'));

describe.each([['claro', false], ['escuro', true]] as const)('SLAMetricCards sem amostra (%s)', (_tema, escuro) => {
  it('mostra travessão e o aviso "Sem dados", nunca 0.0%', () => {
    if (escuro) document.documentElement.classList.add('dark');
    renderizar(false, 0);
    // taxa geral + taxa de 1ª resposta
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.queryByText('0.0%')).toBeNull();
    expect(screen.getByTestId('sla-metric-sem-dados')).toHaveTextContent('Sem dados avaliados no período');
  });

  it('com amostra mostra a taxa real e nenhum aviso de sem dados', () => {
    if (escuro) document.documentElement.classList.add('dark');
    renderizar(true, 75);
    expect(screen.getAllByText('75.0%')).toHaveLength(2);
    expect(screen.queryByTestId('sla-metric-sem-dados')).toBeNull();
    expect(screen.queryByText('—')).toBeNull();
  });
});
