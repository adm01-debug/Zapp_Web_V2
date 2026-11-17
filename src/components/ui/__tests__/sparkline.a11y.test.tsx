/**
 * Defeito: o <svg> do mini-gráfico não era marcado como decorativo, então o leitor
 * de tela anunciava um gráfico sem rótulo nos cartões de SLA. O número que o
 * gráfico ilustra já está em texto no cartão, logo o svg é decoração: aria-hidden.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sparkline } from '../sparkline';
import { SLAMetricCards } from '@/components/queues/SLAMetricCards';

describe('Sparkline (acessibilidade)', () => {
  it('marca o svg como decorativo', () => {
    const { container } = render(<Sparkline data={[1, 4, 2, 7]} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('no cartão de SLA o gráfico fica oculto e a taxa continua em texto', () => {
    const { container } = render(
      <SLAMetricCards
        periodLabel="Hoje"
        sparkOverall={[10, 40, 90]}
        sparkFR={[]}
        sparkConversations={[]}
        data={{
          overallRate: 75,
          totalConversations: 9,
          hasSample: true,
          firstResponse: { rate: 75, onTime: 3, breached: 1 },
        }}
      />,
    );
    const graficos = Array.from(container.querySelectorAll('svg')).filter((s) => s.querySelector('polyline'));
    expect(graficos).toHaveLength(1);
    expect(graficos[0]).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getAllByText('75.0%').length).toBeGreaterThan(0);
  });
});
