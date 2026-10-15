import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { ActivityHeatmap } from '../ActivityHeatmap';

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
      return React.createElement('div', { ...rest, ref });
    }),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  useReducedMotion: () => false,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
};

const dadosDeTeste = [
  { date: new Date('2026-10-01'), count: 5, level: 1 as const },
  { date: new Date('2026-10-02'), count: 25, level: 2 as const },
  { date: new Date('2026-10-03'), count: 60, level: 3 as const },
];

describe('ActivityHeatmap — acessibilidade', () => {
  it('SelectTrigger do seletor de período tem aria-label acessível', () => {
    render(<ActivityHeatmap data={dadosDeTeste} />, { wrapper });
    const trigger = screen.getByLabelText('Filtrar período');
    expect(trigger).toBeInTheDocument();
  });

  it('container rolável do mapa recebe foco pelo teclado e tem nome acessível', () => {
    render(<ActivityHeatmap data={dadosDeTeste} />, { wrapper });
    const region = screen.getByRole('region', { name: /mapa de atividade/i });
    expect(region).toHaveAttribute('tabIndex', '0');
  });

  it('axe: zero violações de scrollable-region-focusable e select-name', async () => {
    const { container } = render(<ActivityHeatmap data={dadosDeTeste} />, { wrapper });
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    const ids = results.violations.map((v) => v.id);
    expect(ids.filter((id) => id === 'scrollable-region-focusable')).toEqual([]);
    expect(ids.filter((id) => id === 'button-name' || id === 'select-name')).toEqual([]);
  });
});

describe('ActivityHeatmap — célula acessível e streak', () => {
  // Datas em horário local: `new Date('2026-10-02')` é meia-noite UTC e, no
  // fuso de Brasília, o rótulo sairia como 1º de outubro.
  const diasLocais = [
    { date: new Date(2026, 9, 1), count: 5, level: 1 as const },
    { date: new Date(2026, 9, 2), count: 25, level: 2 as const },
    { date: new Date(2026, 9, 3), count: 60, level: 3 as const },
  ];

  it('cada célula tem nome acessível com o dia e o valor e recebe foco pelo teclado', () => {
    render(<ActivityHeatmap data={diasLocais} />, { wrapper });
    const celula = screen.getByLabelText('2 de outubro de 2026: 25 mensagens');
    expect(celula).toHaveAttribute('tabindex', '0');
    expect(celula).toHaveAttribute('role', 'img');
  });

  it('streak conta até ontem quando hoje ainda não tem atividade', () => {
    const comHojeZerado = [
      { date: new Date(2026, 9, 1), count: 5, level: 1 as const },
      { date: new Date(2026, 9, 2), count: 25, level: 2 as const },
      { date: new Date(2026, 9, 3), count: 0, level: 0 as const },
    ];
    render(<ActivityHeatmap data={comHojeZerado} />, { wrapper });
    expect(screen.getByText('2 dias')).toBeInTheDocument();
  });
});
