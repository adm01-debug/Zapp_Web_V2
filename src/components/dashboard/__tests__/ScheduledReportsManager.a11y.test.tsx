import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ScheduledReportsManager } from '../ScheduledReportsManager';

// N-053 — os 3 Select do filtro, o Switch da lista e os 2 Select do formulário
// não tinham nome acessível (o <label> do formulário não estava associado).
const mocks = vi.hoisted(() => ({ configs: [] as Array<Record<string, unknown>> }));

vi.mock('@/hooks/dashboard/useScheduledReportConfigs', () => ({
  useScheduledReportConfigs: () => ({
    configs: mocks.configs,
    isLoading: false,
    createConfig: { mutate: vi.fn(), isPending: false },
    toggleActive: { mutate: vi.fn() },
    deleteConfig: { mutate: vi.fn() },
  }),
}));

describe('a11y: ScheduledReportsManager (nome nos seletores e no interruptor)', () => {
  beforeEach(() => {
    mocks.configs.length = 0;
    mocks.configs.push({
      id: 'cfg-1', name: 'Fechamento do mês', report_type: 'performance', frequency: 'monthly',
      recipients: ['gestor@empresa.com'], is_active: true, created_at: '2026-10-08T12:00:00.000Z',
    });
  });

  it('os 6 controles são encontrados por papel e nome', () => {
    render(<ScheduledReportsManager />);
    expect(screen.getByRole('combobox', { name: 'Filtrar por status' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filtrar por frequência' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Ordenar relatórios' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Ativar relatório Fechamento do mês' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Novo Relatório'));
    expect(screen.getByRole('combobox', { name: 'Tipo' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Frequência' })).toBeInTheDocument();
  });

  it('axe não acusa violações nos controles', async () => {
    const { container } = render(<ScheduledReportsManager />);
    const r = await axe(container, { rules: { region: { enabled: false } } });
    expect(r.violations).toEqual([]);
  });
});
