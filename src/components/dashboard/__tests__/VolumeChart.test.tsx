import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VolumeChart } from '../overview/VolumeChart';

const mockUseTodayHourlyVolume = vi.fn();
vi.mock('@/hooks/dashboard/useTodayHourlyVolume', () => ({
  useTodayHourlyVolume: () => mockUseTodayHourlyVolume(),
}));

const mockUseDemandPrediction = vi.fn();
vi.mock('@/hooks/business/useDemandPrediction', () => ({
  useDemandPrediction: () => mockUseDemandPrediction(),
}));

describe('VolumeChart', () => {
  it('sem dados, mostra empty state compacto em vez do gráfico', () => {
    mockUseTodayHourlyVolume.mockReturnValue({ data: { todayByHour: Array(24).fill(0), last7ByDay: [], currentHour: 10, currentHourCount: 0, avg7dCurrentHour: null } });
    mockUseDemandPrediction.mockReturnValue({ data: [] });
    render(<VolumeChart />);
    expect(screen.getByText('Sem conversas no período')).toBeInTheDocument();
  });

  it('com dados, renderiza o plot e a legenda "Conversas reais"', () => {
    const todayByHour = Array(24).fill(0);
    todayByHour[8] = 5;
    mockUseTodayHourlyVolume.mockReturnValue({ data: { todayByHour, last7ByDay: [], currentHour: 10, currentHourCount: 3, avg7dCurrentHour: 2 } });
    mockUseDemandPrediction.mockReturnValue({ data: [] });
    render(<VolumeChart />);
    expect(screen.getByTestId('volume-plot')).toBeInTheDocument();
    expect(screen.getByText('— Conversas reais')).toBeInTheDocument();
    expect(screen.queryByText('╌ Previsão IA')).not.toBeInTheDocument();
  });

  it('com previsão IA disponível, mostra o item de legenda correspondente', () => {
    const todayByHour = Array(24).fill(0);
    todayByHour[8] = 5;
    mockUseTodayHourlyVolume.mockReturnValue({ data: { todayByHour, last7ByDay: [], currentHour: 10, currentHourCount: 3, avg7dCurrentHour: 2 } });
    mockUseDemandPrediction.mockReturnValue({ data: [{ time: '11:00', predicted: 4, lower: 2, upper: 6, isPrediction: true }] });
    render(<VolumeChart />);
    expect(screen.getByText('╌ Previsão IA')).toBeInTheDocument();
  });

  it('não renderiza "Capacidade máxima" (sem fonte real)', () => {
    mockUseTodayHourlyVolume.mockReturnValue({ data: { todayByHour: Array(24).fill(1), last7ByDay: [], currentHour: 10, currentHourCount: 1, avg7dCurrentHour: 1 } });
    mockUseDemandPrediction.mockReturnValue({ data: [] });
    render(<VolumeChart />);
    expect(screen.queryByText(/Capacidade/)).not.toBeInTheDocument();
  });
});
