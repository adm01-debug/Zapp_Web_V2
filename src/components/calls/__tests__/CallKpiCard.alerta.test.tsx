import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CallKpiCard } from '../CallKpiCard';
import { CallsKpiGrid } from '../CallsKpiGrid';

// T39 — o grid de KPIs da Telefonia. O defeito: os 5 tiles são idênticos e o
// número que exige ação ("Perdidas") se perde na fileira. A prova: SÓ o tile de
// "Perdidas" recebe o acento, e o acento é um elemento próprio (tel-kpi-accent).
vi.mock('@/hooks/calls/useCallsKpi', () => ({
  useCallsKpi: () => ({
    data: { total: 12, answered: 8, missed_inbound: 2, inbound: 9, outbound: 3, avg_talk_seconds: 190 },
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
}));

describe('CallKpiCard — acento de atenção (T39)', () => {
  it('o tile padrão não tem acento nem marca de alerta', () => {
    render(<CallKpiCard rotulo="Total" valor={12} />);
    const card = screen.getByTestId('tel-kpi-card');
    expect(card.getAttribute('data-tom')).toBeNull();
    expect(screen.queryByTestId('tel-kpi-accent')).toBeNull();
  });

  it('o tile com alerta mostra o acento e a marca de alerta', () => {
    render(<CallKpiCard rotulo="Perdidas" valor={2} alerta />);
    const card = screen.getByTestId('tel-kpi-card');
    expect(card.getAttribute('data-tom')).toBe('alerta');
    expect(screen.getByTestId('tel-kpi-accent')).toBeInTheDocument();
  });

  it('no grid real, só "Perdidas" recebe o acento', () => {
    render(<CallsKpiGrid period="7d" channel="all" scope="mine" />);

    const cards = screen.getAllByTestId('tel-kpi-card');
    expect(cards).toHaveLength(5);

    const comAcento = cards.filter((c) => c.getAttribute('data-tom') === 'alerta');
    expect(comAcento).toHaveLength(1);
    expect(comAcento[0].textContent).toContain('Perdidas');
    expect(screen.getAllByTestId('tel-kpi-accent')).toHaveLength(1);
  });
});
