import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageSquare } from 'lucide-react';
import { DashboardKpiCard } from '../overview/DashboardKpiCard';
import { formatShortDuration } from '../overview/formatShortDuration';

describe('formatShortDuration', () => {
  it('formata segundos puros', () => expect(formatShortDuration(41)).toBe('41s'));
  it('formata minutos e segundos', () => expect(formatShortDuration(161)).toBe('2m 41s'));
  it('formata horas e minutos com zero à esquerda', () => expect(formatShortDuration(3900)).toBe('1h 05m'));
});

describe('DashboardKpiCard', () => {
  it('delta null renderiza "—" sem seta', () => {
    render(<DashboardKpiCard label="Não Lidas" value="12" delta={null} tile="red" icon={MessageSquare} bars={null} barsColor="red" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('delta { pct } positivo renderiza seta pra cima e sinal de +', () => {
    render(<DashboardKpiCard label="Resolvidas" value="10" delta={{ pct: 25 }} tile="green" icon={MessageSquare} bars={null} barsColor="green" />);
    expect(screen.getByText(/\+25%/)).toBeInTheDocument();
  });

  it('delta { pct, invert } inverte a semântica de cor (negativo = bom)', () => {
    const { container } = render(<DashboardKpiCard label="Tempo de Resposta" value="2m 41s" delta={{ pct: -15, invert: true }} tile="green" icon={MessageSquare} bars={null} barsColor="green" />);
    expect(container.querySelector('.text-dash-green')).not.toBeNull();
  });

  it('delta { text, tone } renderiza o texto customizado', () => {
    render(<DashboardKpiCard label="Atendentes Online" value="3/3" delta={{ text: '● 100% online', tone: 'success' }} tile="green" icon={MessageSquare} bars={null} barsColor="violet" />);
    expect(screen.getByText('● 100% online')).toBeInTheDocument();
  });

  it('bars null renderiza placeholder vazio sem barras', () => {
    render(<DashboardKpiCard label="Não Lidas" value="12" delta={null} tile="red" icon={MessageSquare} bars={null} barsColor="red" />);
    expect(screen.getByTestId('kpi-bars-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('kpi-bars')).not.toBeInTheDocument();
  });

  it('bars com valores renderiza 8 barras', () => {
    render(<DashboardKpiCard label="Conversas Abertas" value="18" delta={null} tile="blue" icon={MessageSquare} bars={[1, 2, 3, 4, 5, 6, 7, 8]} barsColor="blue" />);
    const barsContainer = screen.getByTestId('kpi-bars');
    expect(barsContainer.children).toHaveLength(8);
  });
});
