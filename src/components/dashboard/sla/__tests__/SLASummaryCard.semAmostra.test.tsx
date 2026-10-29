/**
 * R2-SLA-001 — o resumo do SLA não pinta taxa sem amostra.
 * Sem nenhuma 1ª resposta avaliada o número vira travessão e a barra some
 * (antes: 0% com cor de crítico, como se a operação tivesse falhado).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SLASummaryCard } from '../SLASummaryCard';

afterEach(() => document.documentElement.classList.remove('dark'));

function renderizar(hasSample: boolean, escuro: boolean) {
  if (escuro) document.documentElement.classList.add('dark');
  render(
    <SLASummaryCard
      periodFilter="week"
      onPeriodChange={vi.fn()}
      overallRate={85}
      onTime={34}
      breached={6}
      hasSample={hasSample}
    />,
  );
}

describe.each([['claro', false], ['escuro', true]] as const)('SLASummaryCard (%s)', (_tema, escuro) => {
  it('sem amostra: travessão no lugar da taxa e barra zerada, sem vermelho', () => {
    renderizar(false, escuro);
    const rate = screen.getByTestId('sla-summary-rate');
    expect(rate).toHaveTextContent('—');
    expect(rate.className).toContain('text-muted-foreground');
    expect(rate.className).not.toContain('text-destructive');
    expect(screen.queryByText('85%')).toBeNull();
    expect(screen.getAllByText('—').length).toBe(3); // taxa + no prazo + violação
  });

  it('com amostra: mostra a taxa e a cor do token', () => {
    renderizar(true, escuro);
    const rate = screen.getByTestId('sla-summary-rate');
    expect(rate).toHaveTextContent('85%');
    expect(rate.className).toContain('text-warning');
  });
});
