// O teste prova que o gráfico de volume tem aria-label acessível
// (N-056: descrição em texto para leitores de tela).
// Sem a correção, o container do gráfico NÃO tem role="img" nem aria-label.
process.env.TZ = 'UTC';

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VolumeChart } from '../overview/VolumeChart';

vi.mock('@/hooks/dashboard/useTodayHourlyVolume', () => ({
  useTodayHourlyVolume: vi.fn(),
}));

vi.mock('@/hooks/business/useDemandPrediction', () => ({
  useDemandPrediction: vi.fn(),
}));

import { useTodayHourlyVolume } from '@/hooks/dashboard/useTodayHourlyVolume';
import { useDemandPrediction } from '@/hooks/business/useDemandPrediction';

const mockUseTodayHourlyVolume = vi.mocked(useTodayHourlyVolume);
const mockUseDemandPrediction = vi.mocked(useDemandPrediction);

function mockTodayByHour(counts: (number | null)[]) {
  return {
    todayByHour: counts,
    last7ByDay: counts.map((c, i) => ({ date: `2026-06-0${i + 1}`, count: c ?? 0 })),
    currentHour: 10,
    currentHourCount: counts[10] ?? 0,
    avg7dCurrentHour: 5,
  };
}

describe('VolumeChart — acessibilidade', () => {
  it('renderiza o gráfico com aria-label que inclui o total e o período', () => {
    mockUseTodayHourlyVolume.mockReturnValue({
      data: mockTodayByHour([0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 15, 12, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      isPending: false,
    } as never);
    mockUseDemandPrediction.mockReturnValue({ data: [] } as never);

    render(<VolumeChart />);

    const chart = screen.getByTestId('volume-plot');
    expect(chart).toHaveAttribute('role', 'img');
    expect(chart).toHaveAttribute('aria-label');
    expect(chart.getAttribute('aria-label')).toContain('Volume de Atendimentos');
    expect(chart.getAttribute('aria-label')).toContain('50 conversas no total');
    expect(chart.getAttribute('aria-label')).toContain('Hoje');
  });

  it('inclui previsão no aria-label quando há média 7 dias', () => {
    mockUseTodayHourlyVolume.mockReturnValue({
      data: mockTodayByHour([0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 15, 12, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      isPending: false,
    } as never);
    mockUseDemandPrediction.mockReturnValue({
      data: [{ time: '10:00', predicted: 12, isPrediction: true }],
    } as never);

    render(<VolumeChart />);

    const chart = screen.getByTestId('volume-plot');
    expect(chart.getAttribute('aria-label')).toContain('incluindo média 7 dias');
  });

  it('sem dados, mensagem de vazio é acessível', () => {
    mockUseTodayHourlyVolume.mockReturnValue({
      data: mockTodayByHour(Array(24).fill(null)),
      isPending: false,
    } as never);
    mockUseDemandPrediction.mockReturnValue({ data: [] } as never);

    render(<VolumeChart />);

    expect(screen.getByText('Sem conversas no período')).toBeInTheDocument();
  });
});