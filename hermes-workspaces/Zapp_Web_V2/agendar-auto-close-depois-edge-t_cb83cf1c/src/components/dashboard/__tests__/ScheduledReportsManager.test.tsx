import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ScheduledReportsManager } from '../ScheduledReportsManager';

// SL-168 — a tile "Personalizada" de "Frequências Comuns" gravava a frequência
// `biweekly` (que a lista rotula "Quinzenal") por não existir o valor
// "personalizada" nas constantes do componente. A coluna `frequency` de
// `scheduled_report_configs` é TEXT sem CHECK, então o valor novo é de front.
const mocks = vi.hoisted(() => ({
  configs: [] as Array<Record<string, unknown>>,
  mutate: vi.fn(),
}));

vi.mock('@/hooks/dashboard/useScheduledReportConfigs', () => ({
  useScheduledReportConfigs: () => ({
    configs: mocks.configs,
    isLoading: false,
    createConfig: { mutate: mocks.mutate, isPending: false },
    toggleActive: { mutate: vi.fn() },
    deleteConfig: { mutate: vi.fn() },
  }),
}));

describe('ScheduledReportsManager — frequência "Personalizada"', () => {
  beforeEach(() => {
    mocks.configs.length = 0;
    mocks.mutate.mockClear();
  });

  it('a tile "Personalizada" grava a frequência personalizada, não "biweekly"', () => {
    render(<ScheduledReportsManager />);

    fireEvent.click(screen.getByText('Personalizada').closest('button')!);
    fireEvent.change(screen.getByPlaceholderText('Ex: Relatório semanal de performance'), {
      target: { value: 'Fechamento do mês' },
    });
    fireEvent.change(screen.getByPlaceholderText('email1@empresa.com, email2@empresa.com'), {
      target: { value: 'gestor@empresa.com' },
    });
    fireEvent.click(screen.getByText('Criar relatório'));

    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.mutate.mock.calls[0][0]).toMatchObject({
      name: 'Fechamento do mês',
      frequency: 'custom',
      recipients: ['gestor@empresa.com'],
    });
  });

  it('o relatório gravado com a frequência personalizada aparece na lista com o rótulo da tile', () => {
    mocks.configs.push({
      id: 'cfg-1',
      name: 'Fechamento do mês',
      report_type: 'performance',
      frequency: 'custom',
      recipients: ['gestor@empresa.com'],
      is_active: true,
      created_at: '2026-10-08T12:00:00.000Z',
    });

    render(<ScheduledReportsManager />);

    const linha = screen.getByText('Fechamento do mês').closest('div')!.parentElement as HTMLElement;
    expect(within(linha).getByText('Personalizada')).toBeInTheDocument();
    expect(within(linha).queryByText('custom')).not.toBeInTheDocument();
  });
});
