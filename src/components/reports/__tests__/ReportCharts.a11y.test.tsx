import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => true };
});

vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const SvgBox = (props: { children?: React.ReactNode; 'aria-label'?: string; title?: string }) => <svg {...props}>{props.children}</svg>;
  return {
    BarChart: SvgBox,
    AreaChart: SvgBox,
    PieChart: SvgBox,
    LineChart: SvgBox,
    Area: () => null,
    Bar: () => null,
    Pie: () => null,
    Cell: () => null,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
    ResponsiveContainer: Box,
  };
});

import {
  PeriodAreaChart,
  DistributionPieChart,
  DailyMessagesChart,
  AgentsChart,
  ContactsCharts,
} from '../ReportCharts';

const mockDailyData = [
  { date: '2026-01-01', enviadas: 10, recebidas: 5, novos: 3 },
  { date: '2026-01-02', enviadas: 15, recebidas: 8, novos: 4 },
];

const mockBySender = [
  { name: 'Alice', value: 60 },
  { name: 'Bob', value: 40 },
];

const mockByAgent = [
  { name: 'Agente A', mensagens: 100 },
  { name: 'Agente B', mensagens: 50 },
];

const mockByTag = [
  { name: 'VIP', contatos: 30 },
  { name: 'Lead', contatos: 70 },
];

const mockByType = [
  { name: 'WhatsApp', value: 80 },
  { name: 'SMS', value: 20 },
];

describe('ReportCharts — acessibilidade (aria-label e title)', () => {
  it('PeriodAreaChart tem aria-label e title contextual', () => {
    const { container } = render(
      <PeriodAreaChart data={mockDailyData} label="Período Atual" dateLabel="01/01 - 31/01" gradientId="g1" color="hsl(var(--primary))" total={150} isLoading={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-label', 'Gráfico de área Período Atual');
    expect(svg).toHaveAttribute('title', 'Período Atual');
  });

  it('DistributionPieChart tem aria-label e title contextual', () => {
    const { container } = render(
      <DistributionPieChart data={mockBySender} label="Distribuição Atual" isLoading={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-label', 'Gráfico de pizza Distribuição Atual');
    expect(svg).toHaveAttribute('title', 'Distribuição Atual');
  });

  it('DailyMessagesChart AreaChart tem aria-label e title', () => {
    const { container } = render(
      <DailyMessagesChart data={{ daily: mockDailyData, bySender: mockBySender, byAgent: mockByAgent }} isLoading={false} />,
    );
    const svgs = container.querySelectorAll('svg');
    const areaSvg = [...svgs].find(s => s.getAttribute('aria-label')?.includes('mensagens enviadas e recebidas'));
    expect(areaSvg).toBeInTheDocument();
    expect(areaSvg).toHaveAttribute('aria-label', 'Gráfico de mensagens enviadas e recebidas por dia');
    expect(areaSvg).toHaveAttribute('title', 'Mensagens por dia');
  });

  it('DailyMessagesChart PieChart tem aria-label e title', () => {
    const { container } = render(
      <DailyMessagesChart data={{ daily: mockDailyData, bySender: mockBySender, byAgent: mockByAgent }} isLoading={false} />,
    );
    const svgs = container.querySelectorAll('svg');
    const pieSvg = [...svgs].find(s => s.getAttribute('aria-label')?.includes('remetentes'));
    expect(pieSvg).toBeInTheDocument();
    expect(pieSvg).toHaveAttribute('aria-label', 'Gráfico de distribuição de remetentes');
    expect(pieSvg).toHaveAttribute('title', 'Distribuição por remetente');
  });

  it('AgentsChart tem aria-label e title', () => {
    const { container } = render(
      <AgentsChart data={mockByAgent} isLoading={false} />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-label', 'Gráfico de mensagens por agente');
    expect(svg).toHaveAttribute('title', 'Mensagens por agente');
  });

  it('ContactsCharts LineChart tem aria-label e title', () => {
    const { container } = render(
      <ContactsCharts data={{ daily: mockDailyData, byType: mockByType, byTag: mockByTag }} isLoading={false} />,
    );
    const svgs = container.querySelectorAll('svg');
    const lineSvg = [...svgs].find(s => s.getAttribute('aria-label')?.includes('novos contatos'));
    expect(lineSvg).toBeInTheDocument();
    expect(lineSvg).toHaveAttribute('aria-label', 'Gráfico de novos contatos por dia');
    expect(lineSvg).toHaveAttribute('title', 'Novos contatos por dia');
  });

  it('ContactsCharts PieChart tem aria-label e title', () => {
    const { container } = render(
      <ContactsCharts data={{ daily: mockDailyData, byType: mockByType, byTag: mockByTag }} isLoading={false} />,
    );
    const svgs = container.querySelectorAll('svg');
    const pieSvg = [...svgs].find(s => s.getAttribute('aria-label')?.includes('contatos por tipo'));
    expect(pieSvg).toBeInTheDocument();
    expect(pieSvg).toHaveAttribute('aria-label', 'Gráfico de contatos por tipo');
    expect(pieSvg).toHaveAttribute('title', 'Contatos por tipo');
  });

  it('ContactsCharts BarChart tem aria-label e title', () => {
    const { container } = render(
      <ContactsCharts data={{ daily: mockDailyData, byType: mockByType, byTag: mockByTag }} isLoading={false} />,
    );
    const svgs = container.querySelectorAll('svg');
    const barSvg = [...svgs].find(s => s.getAttribute('aria-label')?.includes('contatos por tag'));
    expect(barSvg).toBeInTheDocument();
    expect(barSvg).toHaveAttribute('aria-label', 'Gráfico de contatos por tag');
    expect(barSvg).toHaveAttribute('title', 'Contatos por tag');
  });
});