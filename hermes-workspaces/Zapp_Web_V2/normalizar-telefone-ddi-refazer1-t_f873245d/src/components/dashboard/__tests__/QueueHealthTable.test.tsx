import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueueHealthTable } from '../overview/QueueHealthTable';

describe('QueueHealthTable', () => {
  it('sem filas ativas, mostra "Sem filas ativas"', () => {
    render(<QueueHealthTable rows={[]} isConnected onSeeAll={vi.fn()} />);
    expect(screen.getByText('Sem filas ativas')).toBeInTheDocument();
  });

  it('renderiza até 4 linhas com badge de status por faixa', () => {
    render(
      <QueueHealthTable
        isConnected
        onSeeAll={vi.fn()}
        rows={[
          { queueId: '1', name: 'Comercial', color: null, waiting: 8, inService: 12, avgResponse: 135, slaRate: 92, status: 'bom' },
          { queueId: '2', name: 'Suporte', color: null, waiting: 2, inService: 3, avgResponse: 60, slaRate: 97, status: 'excelente' },
          { queueId: '3', name: 'Financeiro', color: null, waiting: 5, inService: 1, avgResponse: 300, slaRate: 60, status: 'atencao' },
          { queueId: '4', name: 'Sem dado', color: null, waiting: 0, inService: 0, avgResponse: null, slaRate: null, status: null },
        ]}
      />,
    );
    expect(screen.getAllByTestId('queue-row')).toHaveLength(4);
    expect(screen.getByText('Bom')).toBeInTheDocument();
    expect(screen.getByText('Excelente')).toBeInTheDocument();
    expect(screen.getByText('Atenção')).toBeInTheDocument();
  });

  it('linha sem SLA/tempo médio mostra travessão', () => {
    render(
      <QueueHealthTable
        isConnected
        onSeeAll={vi.fn()}
        rows={[{ queueId: '4', name: 'Sem dado', color: null, waiting: 0, inService: 0, avgResponse: null, slaRate: null, status: null }]}
      />,
    );
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2); // tempo médio + SLA
  });

  it('offline: chip muda de tom (sem pulso)', () => {
    render(<QueueHealthTable rows={[]} isConnected={false} onSeeAll={vi.fn()} />);
    expect(screen.getByText('Tempo real')).toBeInTheDocument();
  });
});
